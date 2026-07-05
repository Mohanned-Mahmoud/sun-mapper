import tzlookup from "tz-lookup";

export interface WeatherResult {
  available: boolean;
  temperatureCelsius: number;
  weatherCode: number;
  description: string;
  badge: "Hot" | "Warm" | "Cool";
  weatherTimestamp?: string;
  unavailableReason?: string;
}

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Heavy thunderstorm with hail",
};

function getWeatherDescription(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? "Unknown conditions";
}

function getBadge(
  temp: number,
  hotThreshold: number,
  warmThreshold: number
): "Hot" | "Warm" | "Cool" {
  if (temp >= hotThreshold) return "Hot";
  if (temp >= warmThreshold) return "Warm";
  return "Cool";
}

function localDatetimeString(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(", ", "T")
    .replace(/\//g, "-");
}

function parseLocalSlot(slotStr: string): number {
  // Open-Meteo returns "YYYY-MM-DDTHH:00" — parse as minutes since midnight on that date
  const [, timePart] = slotStr.split("T");
  if (!timePart) return 0;
  const [h, m] = timePart.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const UNAVAILABLE: WeatherResult = {
  available: false,
  temperatureCelsius: 0,
  weatherCode: 0,
  description: "",
  badge: "Warm",
};

export async function fetchWeather(
  lat: number,
  lon: number,
  departureTime: Date,
  hotThreshold = 32,
  warmThreshold = 22
): Promise<WeatherResult> {
  // Reject dates beyond the 16-day forecast window
  const nowMs = Date.now();
  const maxForecastMs = nowMs + 16 * 24 * 60 * 60 * 1000;
  if (departureTime.getTime() > maxForecastMs) {
    return {
      ...UNAVAILABLE,
      unavailableReason: "Weather forecast not available this far in advance (limit: 16 days)",
    };
  }

  let tz: string;
  try {
    tz = tzlookup(lat, lon);
  } catch {
    tz = "UTC";
  }

  const localDeparture = localDatetimeString(departureTime, tz);
  const dateStr = localDeparture.split("T")[0];

  if (!dateStr) {
    return { ...UNAVAILABLE, unavailableReason: "Could not determine local date" };
  }

  const localMinutes = parseLocalSlot(localDeparture);

  // NOTE: start_date/end_date and forecast_days are mutually exclusive in the Open-Meteo API.
  // We use start_date/end_date to fetch exactly one day of data, and omit forecast_days.
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("hourly", "temperature_2m,weathercode");
  url.searchParams.set("start_date", dateStr);
  url.searchParams.set("end_date", dateStr);
  url.searchParams.set("timezone", tz);
  url.searchParams.set("temperature_unit", "celsius");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...UNAVAILABLE, unavailableReason: `Weather service unreachable: ${msg}` };
  }

  if (!response.ok) {
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    let reason = `Weather service error ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { reason?: string };
      if (parsed.reason) reason = parsed.reason;
    } catch { /* use status code message */ }
    return { ...UNAVAILABLE, unavailableReason: reason };
  }

  let data: {
    hourly?: { time: string[]; temperature_2m: number[]; weathercode: number[] };
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return { ...UNAVAILABLE, unavailableReason: "Weather service returned invalid JSON" };
  }

  const hourly = data.hourly;
  if (!hourly || hourly.time.length === 0) {
    return { ...UNAVAILABLE, unavailableReason: "No hourly data available for this date/location" };
  }

  const { time, temperature_2m, weathercode } = hourly;

  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < time.length; i++) {
    const slotMinutes = parseLocalSlot(time[i] ?? "");
    const diff = Math.abs(slotMinutes - localMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  const temperatureCelsius = temperature_2m[bestIdx];
  const weatherCode = weathercode[bestIdx];

  if (temperatureCelsius == null || weatherCode == null) {
    return { ...UNAVAILABLE, unavailableReason: "Weather data missing for requested time slot" };
  }

  const result: WeatherResult = {
    available: true,
    temperatureCelsius: Math.round(temperatureCelsius * 10) / 10,
    weatherCode,
    description: getWeatherDescription(weatherCode),
    badge: getBadge(temperatureCelsius, hotThreshold, warmThreshold),
    weatherTimestamp: time[bestIdx],
  };

  console.log(
    `[weather] lat=${lat} lon=${lon} tz=${tz} departure=${localDeparture} ` +
    `→ slot=${time[bestIdx]} temp=${result.temperatureCelsius}°C code=${weatherCode} (${result.description})`
  );

  return result;
}
