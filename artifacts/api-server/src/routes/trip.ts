import { Router, type IRouter } from "express";
import { AnalyzeTripBody, AnalyzeTripResponse } from "@workspace/api-zod";
import { computeBearing, haversineDistanceKm, computeSunSides, computeSunSidesFromPolyline } from "../lib/sunMath.js";
import { fetchWeather } from "../lib/weather.js";
import { getRoute } from "../lib/routing.js";

const router: IRouter = Router();

const HOT_THRESHOLD = Number(process.env["TEMP_HOT_THRESHOLD"] ?? 32);
const WARM_THRESHOLD = Number(process.env["TEMP_WARM_THRESHOLD"] ?? 22);

const ROAD_SOURCES = new Set(["osrm", "openrouteservice"]);

function buildRecommendation(
  sunSide: "Left" | "Right" | "None",
  sunPercentLeft: number,
  sunPercentRight: number,
  segmentBreakdown: Array<{
    durationMinutes: number;
    headingLabel: string;
    sunSide: "Left" | "Right" | "None";
  }>,
  totalDurationMinutes: number,
  routingSource: string
): string {
  if (sunSide === "None") {
    return "No direct sun during this leg — sit anywhere comfortably.";
  }

  const hasBreakdown = segmentBreakdown.length > 1;

  if (hasBreakdown) {
    const parts = segmentBreakdown
      .filter((s) => s.sunSide !== "None")
      .map((s) => {
        const mins = Math.round(s.durationMinutes);
        const minsLabel = mins < 1 ? "< 1 min" : `~${mins} min`;
        const side = s.sunSide.toUpperCase();
        return `Sun on the ${side} for ${minsLabel} (heading ${s.headingLabel})`;
      });

    if (parts.length === 1) {
      const sitSide = sunSide === "Left" ? "RIGHT" : "LEFT";
      const dominantPct = sunSide === "Left" ? sunPercentLeft : sunPercentRight;
      return `Sun on the ${sunSide.toUpperCase()} side for ~${dominantPct}% of this ride. Sit on the ${sitSide} to avoid it.`;
    }

    return parts.join(", then ") + ".";
  }

  const dominantPercent = sunSide === "Left" ? sunPercentLeft : sunPercentRight;
  const sitSide = sunSide === "Left" ? "RIGHT" : "LEFT";
  const railNote = routingSource === "straight_line_rail" ? " (direction estimated — rail route data not available)" : "";
  return `Sun will be on the ${sunSide.toUpperCase()} side for ~${dominantPercent}% of this ride. Sit on the ${sitSide} to avoid it.${railNote}`;
}

router.post("/trip/analyze", async (req, res) => {
  const parsed = AnalyzeTripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body: " + parsed.error.message });
    return;
  }

  const { legs } = parsed.data;

  try {
    const legResults = await Promise.all(
      legs.map(async (leg, index) => {
        const departure = new Date(leg.departureTime);
        const distanceKm = haversineDistanceKm(leg.fromLat, leg.fromLon, leg.toLat, leg.toLon);
        const straightBearing = computeBearing(leg.fromLat, leg.fromLon, leg.toLat, leg.toLon);

        const [routeResult, weatherResult] = await Promise.all([
          getRoute(leg.fromLat, leg.fromLon, leg.toLat, leg.toLon, leg.vehicleType, distanceKm),
          fetchWeather(leg.fromLat, leg.fromLon, departure, HOT_THRESHOLD, WARM_THRESHOLD).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              available: false as const,
              temperatureCelsius: 0,
              weatherCode: 0,
              description: "",
              badge: "Warm" as const,
              unavailableReason: `Weather fetch failed: ${msg}`,
            };
          }),
        ]);

        let sunResult;
        if (ROAD_SOURCES.has(routeResult.source) && routeResult.routeCoordinates.length >= 2) {
          sunResult = computeSunSidesFromPolyline(
            routeResult.routeCoordinates,
            departure,
            routeResult.durationMinutes
          );
        } else {
          const bearing = straightBearing;
          const basic = computeSunSides(
            leg.fromLat,
            leg.fromLon,
            bearing,
            departure,
            routeResult.durationMinutes
          );
          sunResult = { ...basic, segmentBreakdown: [] };
        }

        const recommendation = buildRecommendation(
          sunResult.sunSide,
          sunResult.sunPercentLeft,
          sunResult.sunPercentRight,
          sunResult.segmentBreakdown,
          routeResult.durationMinutes,
          routeResult.source
        );

        return {
          legIndex: index,
          vehicleType: leg.vehicleType,
          fromLabel: leg.fromLabel,
          toLabel: leg.toLabel,
          bearing: Math.round(straightBearing * 10) / 10,
          durationMinutes: routeResult.durationMinutes,
          distanceKm: routeResult.distanceKm,
          sunSide: sunResult.sunSide,
          sunPercentLeft: sunResult.sunPercentLeft,
          sunPercentRight: sunResult.sunPercentRight,
          recommendation,
          weather: weatherResult,
          samples: sunResult.samples,
          routingSource: routeResult.source,
          routeCoordinates: routeResult.routeCoordinates,
          segmentBreakdown: sunResult.segmentBreakdown,
        };
      })
    );

    const result = AnalyzeTripResponse.parse({
      legs: legResults,
      analyzedAt: new Date().toISOString(),
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Trip analysis error");
    res.status(500).json({ error: "Failed to analyze trip" });
  }
});

export default router;
