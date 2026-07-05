import { useState } from "react";
import { format, addMinutes } from "date-fns";
import {
  Plus,
  Trash2,
  ArrowRight,
  ArrowDown,
  Sun,
  ThermometerSun,
  AlertCircle,
  RefreshCcw,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useAnalyzeTrip, type GeocodeSuggestion, type TripAnalysis } from "@workspace/api-client-react";
import { LocationPicker } from "@/components/LocationPicker";
import { VehicleIcon } from "@/components/VehicleIcons";
import { VehicleDiagram } from "@/components/VehicleDiagram";
import { SunTimeline } from "@/components/SunTimeline";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Auto-departure time constants (minutes)
const ESTIMATED_LEG_MINUTES = 30;
const TRANSFER_BUFFER_MINUTES = 5;

type PartialTripLeg = {
  id: string;
  vehicleType: string;
  from: GeocodeSuggestion | null;
  to: GeocodeSuggestion | null;
  departureTime: string;
  /** True when this leg's time was auto-calculated and not yet manually edited */
  timeIsAutoCalculated: boolean;
};

export default function Home() {
  const [view, setView] = useState<"planner" | "results">("planner");
  const [legs, setLegs] = useState<PartialTripLeg[]>([
    {
      id: crypto.randomUUID(),
      vehicleType: "Bus",
      from: null,
      to: null,
      departureTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      timeIsAutoCalculated: false,
    },
  ]);
  const [analysis, setAnalysis] = useState<TripAnalysis | null>(null);
  // Index of the leg whose time changed and has subsequent auto-calculated legs
  const [recalcFromIdx, setRecalcFromIdx] = useState<number | null>(null);
  // Per-leg active segment idx for timeline<->diagram hover sync
  const [activeSegments, setActiveSegments] = useState<Record<number, number | null>>({});

  const analyzeMutation = useAnalyzeTrip();

  const addLeg = () => {
    const lastLeg = legs[legs.length - 1];
    const lastIdx = legs.length - 1;

    // Use analyzed duration if available, else fall back to estimate
    const prevDuration =
      analysis?.legs[lastIdx]?.durationMinutes ?? ESTIMATED_LEG_MINUTES;

    const prevDeparture = lastLeg?.departureTime
      ? new Date(lastLeg.departureTime)
      : new Date();

    const autoTime = addMinutes(prevDeparture, prevDuration + TRANSFER_BUFFER_MINUTES);

    setLegs([
      ...legs,
      {
        id: crypto.randomUUID(),
        vehicleType: "Bus",
        from: lastLeg?.to || null,
        to: null,
        departureTime: format(autoTime, "yyyy-MM-dd'T'HH:mm"),
        timeIsAutoCalculated: true,
      },
    ]);
  };

  const removeLeg = (id: string) => {
    if (legs.length > 1) {
      setLegs(legs.filter((l) => l.id !== id));
      setRecalcFromIdx(null);
    }
  };

  const updateLeg = (id: string, updates: Partial<PartialTripLeg>) => {
    setLegs((prev) => {
      const changedIdx = prev.findIndex((l) => l.id === id);

      // When user manually edits the departure time, mark it as no longer auto
      let finalUpdates = updates;
      if (updates.departureTime !== undefined) {
        finalUpdates = { ...updates, timeIsAutoCalculated: false };

        // Check if any subsequent legs are auto-calculated
        const hasAutoAfter = prev
          .slice(changedIdx + 1)
          .some((l) => l.timeIsAutoCalculated);
        if (hasAutoAfter && changedIdx < prev.length - 1) {
          setRecalcFromIdx(changedIdx);
        } else {
          setRecalcFromIdx(null);
        }
      }

      return prev.map((l) => (l.id === id ? { ...l, ...finalUpdates } : l));
    });
  };

  /** Recalculate departure times for all auto-calculated legs after `fromIdx` */
  const recalculateFollowingLegs = () => {
    if (recalcFromIdx === null) return;
    setLegs((prev) => {
      const updated = [...prev];
      for (let i = recalcFromIdx + 1; i < updated.length; i++) {
        if (!updated[i].timeIsAutoCalculated) continue;
        const prevLeg = updated[i - 1];
        const prevDuration =
          analysis?.legs[i - 1]?.durationMinutes ?? ESTIMATED_LEG_MINUTES;
        const prevDeparture = prevLeg.departureTime
          ? new Date(prevLeg.departureTime)
          : new Date();
        updated[i] = {
          ...updated[i],
          departureTime: format(
            addMinutes(prevDeparture, prevDuration + TRANSFER_BUFFER_MINUTES),
            "yyyy-MM-dd'T'HH:mm"
          ),
        };
      }
      return updated;
    });
    setRecalcFromIdx(null);
  };

  const canAnalyze = legs.every((l) => l.from && l.to && l.departureTime);

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    analyzeMutation.mutate(
      {
        data: {
          legs: legs.map((l) => ({
            vehicleType: l.vehicleType as any,
            fromLabel: l.from!.displayName,
            fromLat: l.from!.lat,
            fromLon: l.from!.lon,
            toLabel: l.to!.displayName,
            toLat: l.to!.lat,
            toLon: l.to!.lon,
            departureTime: new Date(l.departureTime).toISOString(),
          })),
        },
      },
      {
        onSuccess: (data) => {
          setAnalysis(data);
          setView("results");
          setActiveSegments({});
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-20">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-6 px-4 shadow-sm sticky top-0 z-30">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sun className="w-6 h-6 fill-current text-yellow-300" />
              SunSide
            </h1>
            <p className="text-primary-foreground/80 text-sm font-medium mt-1">
              Find the shady seat on your commute.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-6">
        {/* ── Planner ── */}
        {view === "planner" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Recalculate banner */}
            {recalcFromIdx !== null && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                <span className="flex-1">
                  You changed an earlier leg's time. Recalculate the following legs?
                </span>
                <button
                  className="shrink-0 font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1"
                  onClick={recalculateFollowingLegs}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Update
                </button>
                <button
                  className="shrink-0 text-amber-500 hover:text-amber-700 text-xs"
                  onClick={() => setRecalcFromIdx(null)}
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="space-y-4">
              {legs.map((leg, index) => (
                <Card
                  key={leg.id}
                  className="relative overflow-visible border-border/50 shadow-sm"
                >
                  {legs.length > 1 && (
                    <div className="absolute -left-3 -top-3 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10">
                      {index + 1}
                    </div>
                  )}

                  <CardContent className="p-4 space-y-4 pt-5">
                    <div className="flex justify-between items-center">
                      <Select
                        value={leg.vehicleType}
                        onValueChange={(val) => updateLeg(leg.id, { vehicleType: val })}
                      >
                        <SelectTrigger className="w-[140px] h-10 bg-secondary/50 border-0">
                          <SelectValue placeholder="Vehicle" />
                        </SelectTrigger>
                        <SelectContent>
                          {["Bus", "Microbus", "Car"].map((type) => (
                            <SelectItem key={type} value={type}>
                              <div className="flex items-center gap-2">
                                <VehicleIcon type={type as any} className="w-4 h-4 text-primary" />
                                <span>{type}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLeg(leg.id)}
                        disabled={legs.length === 1}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <LocationPicker
                        placeholder="From where?"
                        value={leg.from}
                        onChange={(val) => updateLeg(leg.id, { from: val })}
                      />
                      <div className="flex justify-center py-1">
                        <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
                          <ArrowDown className="w-5 h-5" />
                        </div>
                      </div>
                      <LocationPicker
                        placeholder="To where?"
                        value={leg.to}
                        onChange={(val) => updateLeg(leg.id, { to: val })}
                      />
                    </div>

                    <div>
                      <Input
                        type="datetime-local"
                        value={leg.departureTime}
                        onChange={(e) =>
                          updateLeg(leg.id, { departureTime: e.target.value })
                        }
                        className="bg-secondary/30 border-0"
                      />
                      {leg.timeIsAutoCalculated && (
                        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5 pl-1">
                          <Clock className="w-3 h-3" />
                          Auto-calculated from previous leg — edit to override
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={addLeg}
              className="w-full border-dashed border-2 bg-transparent hover:bg-secondary/50 h-12"
            >
              <Plus className="w-4 h-4 mr-2 text-primary" /> Add connection
            </Button>

            <Button
              size="lg"
              className="w-full h-14 text-lg font-bold shadow-md active-elevate"
              disabled={!canAnalyze || analyzeMutation.isPending}
              onClick={handleAnalyze}
            >
              {analyzeMutation.isPending ? (
                <>
                  <RefreshCcw className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing Sun Path...
                </>
              ) : (
                "Analyze My Commute"
              )}
            </Button>

            {!canAnalyze && (
              <p className="text-center text-sm text-muted-foreground mt-2">
                Fill in all locations to continue
              </p>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {view === "results" && analysis && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
            <Button
              variant="ghost"
              onClick={() => setView("planner")}
              className="-ml-2 mb-2 text-muted-foreground"
            >
              <ArrowRight className="w-4 h-4 mr-2 rotate-180" /> Back to planner
            </Button>

            <RouteMap legs={analysis.legs} />

            {analysis.legs.map((leg, idx) => {
              const isHot = leg.weather.available && leg.weather.badge === "Hot";
              const hasBreakdown =
                leg.segmentBreakdown && leg.segmentBreakdown.length > 1;
              const activeSegIdx = activeSegments[idx] ?? null;

              // The side shown in the diagram when a timeline segment is hovered
              const activeSide: "Left" | "Right" | "None" | null =
                activeSegIdx !== null && leg.segmentBreakdown?.[activeSegIdx]
                  ? (leg.segmentBreakdown[activeSegIdx].sunSide as "Left" | "Right" | "None")
                  : null;

              return (
                <Card key={idx} className="overflow-hidden border-border/60 shadow-sm">
                  <div className="bg-secondary/30 px-4 py-3 border-b flex justify-between items-center">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                        {idx + 1}
                      </div>
                      <span className="truncate max-w-[200px]">
                        {leg.fromLabel.split(",")[0]} → {leg.toLabel.split(",")[0]}
                      </span>
                    </div>
                    <VehicleIcon type={leg.vehicleType} className="w-5 h-5 text-muted-foreground" />
                  </div>

                  <CardContent className="p-0">
                    <div className="p-6 relative">
                      {/* Vehicle diagram — syncs with timeline hover */}
                      <VehicleDiagram
                        vehicleType={leg.vehicleType}
                        sunSide={leg.sunSide}
                        sunPercentLeft={leg.sunPercentLeft}
                        sunPercentRight={leg.sunPercentRight}
                        samples={leg.samples}
                        activeSide={activeSide}
                      />

                      <div className="text-center mt-6">
                        {leg.weather.available ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-3">
                            <ThermometerSun
                              className={`w-4 h-4 ${isHot ? "text-destructive" : "text-primary"}`}
                            />
                            {leg.weather.temperatureCelsius}°C
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded-md ${
                                isHot
                                  ? "bg-destructive/10 text-destructive"
                                  : leg.weather.badge === "Warm"
                                  ? "bg-primary/10 text-primary"
                                  : "bg-blue-500/10 text-blue-600"
                              }`}
                            >
                              {leg.weather.badge}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm mb-3">
                            <AlertCircle className="w-4 h-4" />
                            <span>
                              {leg.weather.unavailableReason ?? "Weather unavailable"}
                            </span>
                          </div>
                        )}

                        <p className="text-lg font-bold text-foreground mb-1">
                          {leg.recommendation}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {leg.sunSide !== "None"
                            ? `Sun is on the ${leg.sunSide.toLowerCase()} for ~${
                                leg.sunSide === "Left" ? leg.sunPercentLeft : leg.sunPercentRight
                              }% of the ride.`
                            : "No direct sun expected on this leg."}
                        </p>
                      </div>
                    </div>

                    {/* Sun timeline — visual proportional bar */}
                    {hasBreakdown && (
                      <div className="px-4 pb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Sun changes along route
                        </p>
                        <SunTimeline
                          segmentBreakdown={leg.segmentBreakdown!}
                          totalDurationMinutes={leg.durationMinutes}
                          activeSegmentIdx={activeSegIdx}
                          onSegmentHover={(segIdx) =>
                            setActiveSegments((prev) => ({ ...prev, [idx]: segIdx }))
                          }
                        />
                      </div>
                    )}

                    <div className="bg-muted/50 p-4 border-t flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal bg-background">
                        {leg.durationMinutes} mins
                      </Badge>
                      <Badge variant="secondary" className="font-normal bg-background">
                        {leg.distanceKm.toFixed(1)} km
                      </Badge>
                      {leg.routingSource === "osrm" && (
                        <Badge variant="secondary" className="font-normal bg-green-50 text-green-700 border-green-200">
                          Real road route
                        </Badge>
                      )}
                      {leg.routingSource === "straight_line_rail" && (
                        <div className="flex items-center gap-1 ml-auto text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          <span>Approx. direction (rail route data unavailable)</span>
                        </div>
                      )}
                      {leg.routingSource === "straight_line" && (
                        <div className="flex items-center gap-1 ml-auto text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          <span>Estimated straight-line path — road data unavailable</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="bg-primary text-primary-foreground p-4 rounded-xl shadow-md text-center">
              <p className="font-medium">
                Your commute: {analysis.legs.length} leg
                {analysis.legs.length > 1 ? "s" : ""}, ~
                {analysis.legs.reduce((acc, leg) => acc + leg.durationMinutes, 0)} total
                minutes
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
