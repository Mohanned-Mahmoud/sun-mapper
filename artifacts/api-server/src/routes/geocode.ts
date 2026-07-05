import { Router } from "express";
import { GeocodeAddressQueryParams, GeocodeAddressResponse } from "@workspace/api-zod";

const router = Router();

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "SunSide/1.0 (sun-side seating planner; contact@sunside.app)";

// Default reference point (Cairo, Egypt — primary market)
const DEFAULT_LAT = 30.0444;
const DEFAULT_LON = 31.2357;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type NominatimItem = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

async function nominatimSearch(
  q: string,
  fetchLimit: number,
  viewbox?: string
): Promise<NominatimItem[]> {
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(fetchLimit));
  url.searchParams.set("addressdetails", "1");

  if (viewbox) {
    url.searchParams.set("viewbox", viewbox);
    // bounded=0 means "soft bias" — prefer results inside the box, don't exclude others
    url.searchParams.set("bounded", "0");
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json() as Promise<NominatimItem[]>;
}

router.get("/geocode", async (req: any, res: any) => {
  const parsed = GeocodeAddressQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing required query parameter: q" });
    return;
  }

  const { q, limit = 5, userLat, userLon } = parsed.data;

  // Reference point: user location → supplied map center (same params) → Cairo default
  const refLat = userLat ?? DEFAULT_LAT;
  const refLon = userLon ?? DEFAULT_LON;

  const fetchLimit = Math.min(limit * 3, 18); // fetch extra candidates for re-ranking
  const delta = 2; // ±2° ≈ ~220 km bounding box
  const viewbox = `${refLon - delta},${refLat + delta},${refLon + delta},${refLat - delta}`;

  try {
    // Attempt 1: search with local viewbox bias
    let raw = await nominatimSearch(q, fetchLimit, viewbox);

    // Attempt 2: if no results, retry without viewbox (worldwide)
    if (raw.length === 0) {
      raw = await nominatimSearch(q, fetchLimit);
    }

    // Attempt 3: if still empty, retry with just the first meaningful word
    if (raw.length === 0) {
      const firstWord = q.trim().split(/\s+/)[0];
      if (firstWord && firstWord !== q.trim()) {
        raw = await nominatimSearch(firstWord, fetchLimit, viewbox);
        if (raw.length === 0) {
          raw = await nominatimSearch(firstWord, fetchLimit);
        }
      }
    }

    // Map to suggestions with distance
    let suggestions = raw.map((item) => {
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      const distanceKm = haversineKm(refLat, refLon, lat, lon);
      return {
        displayName: item.display_name,
        lat,
        lon,
        placeId: String(item.place_id),
        distanceKm: Math.round(distanceKm * 10) / 10,
      };
    });

    // Sort closest first
    suggestions.sort((a, b) => a.distanceKm - b.distanceKm);

    // Return only the requested limit
    suggestions = suggestions.slice(0, limit);

    const data = GeocodeAddressResponse.parse(suggestions);
    res.json(data);
  } catch (err) {
    (req as any).log.error({ err }, "Geocoding error");
    res.status(500).json({ error: "Internal server error during geocoding" });
  }
});

export default router;
