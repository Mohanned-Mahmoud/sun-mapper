export interface RouteResult {
  durationMinutes: number;
  distanceKm: number;
  source: "osrm" | "openrouteservice" | "straight_line" | "straight_line_rail";
  routeCoordinates: [number, number][];
}

const VEHICLE_SPEEDS_KMH: Record<string, number> = {
  Bus: 25,
  Microbus: 30,
  Car: 40,
  Train: 60,
  Metro: 45,
};

const ROAD_VEHICLES = new Set(["Car", "Bus", "Microbus"]);
const RAIL_VEHICLES = new Set(["Train", "Metro"]);

function interpolateCoords(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  steps = 20
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    coords.push([fromLat + (toLat - fromLat) * t, fromLon + (toLon - fromLon) * t]);
  }
  return coords;
}

async function fetchOsrmRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  profile: "driving" | "cycling" | "walking" = "driving"
): Promise<RouteResult | null> {
  const url =
    `https://router.project-osrm.org/route/v1/${profile}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;

  const data = await response.json() as {
    code: string;
    routes?: Array<{
      duration: number;
      distance: number;
      geometry: { coordinates: [number, number][] };
    }>;
  };

  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null;

  const route = data.routes[0];
  const lngLatCoords = route.geometry.coordinates;
  const latLonCoords: [number, number][] = lngLatCoords.map(([lng, lat]) => [lat, lng]);

  return {
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    source: "osrm",
    routeCoordinates: latLonCoords,
  };
}

async function fetchOrsRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  vehicleType: string,
  orsKey: string
): Promise<RouteResult | null> {
  const profile =
    vehicleType === "Car" || vehicleType === "Bus" || vehicleType === "Microbus"
      ? "driving-car"
      : "foot-walking";

  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
  const body = {
    coordinates: [
      [fromLon, fromLat],
      [toLon, toLat],
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: orsKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const data = await response.json() as {
    features: Array<{
      properties: { summary: { duration: number; distance: number } };
      geometry: { coordinates: [number, number][] };
    }>;
  };

  const feature = data.features[0];
  if (!feature) return null;

  const { duration, distance } = feature.properties.summary;
  const lngLatCoords = feature.geometry.coordinates;
  const latLonCoords: [number, number][] = lngLatCoords.map(([lng, lat]) => [lat, lng]);

  return {
    durationMinutes: Math.round(duration / 60),
    distanceKm: Math.round((distance / 1000) * 10) / 10,
    source: "openrouteservice",
    routeCoordinates: latLonCoords,
  };
}

export async function getRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  vehicleType: string,
  distanceKm: number
): Promise<RouteResult> {
  const avgSpeed = VEHICLE_SPEEDS_KMH[vehicleType] ?? 30;
  const estimatedDurationMinutes = Math.max(1, Math.round((distanceKm / avgSpeed) * 60));

  if (RAIL_VEHICLES.has(vehicleType)) {
    return {
      durationMinutes: estimatedDurationMinutes,
      distanceKm: Math.round(distanceKm * 10) / 10,
      source: "straight_line_rail",
      routeCoordinates: interpolateCoords(fromLat, fromLon, toLat, toLon),
    };
  }

  if (ROAD_VEHICLES.has(vehicleType)) {
    try {
      const osrmResult = await fetchOsrmRoute(fromLat, fromLon, toLat, toLon, "driving");
      if (osrmResult) return osrmResult;
    } catch {
      // fall through to ORS
    }

    const orsKey = process.env["ORS_API_KEY"];
    if (orsKey) {
      try {
        const orsResult = await fetchOrsRoute(fromLat, fromLon, toLat, toLon, vehicleType, orsKey);
        if (orsResult) return orsResult;
      } catch {
        // fall through to straight-line
      }
    }
  }

  return {
    durationMinutes: estimatedDurationMinutes,
    distanceKm: Math.round(distanceKm * 10) / 10,
    source: "straight_line",
    routeCoordinates: interpolateCoords(fromLat, fromLon, toLat, toLon),
  };
}
