import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { LegResult } from "@workspace/api-client-react";

interface RouteMapProps {
  legs: LegResult[];
}

function MapFitter({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [bounds, map]);
  return null;
}

const LEG_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ef4444", "#06b6d4"];

const createCircleIcon = (color: string) => L.divIcon({
  className: "custom-circle-icon",
  html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 2px rgba(0,0,0,0.5);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const createSunIcon = (side: "Left" | "Right") => L.divIcon({
  className: "custom-sun-icon",
  html: `<div style="background-color: #f59e0b; color: white; font-size: 10px; font-weight: bold; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid white;">${side === "Left" ? "L" : "R"}</div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

export function RouteMap({ legs }: RouteMapProps) {
  if (!legs || legs.length === 0) return null;

  const allCoords = legs.flatMap(leg => leg.routeCoordinates);
  if (allCoords.length === 0) return null;

  const bounds = L.latLngBounds(allCoords.map(c => [c[0], c[1]]));

  return (
    <div className="w-full flex flex-col gap-2 my-4">
      <div className="rounded-lg overflow-hidden border shadow-sm" style={{ height: 300, zIndex: 0 }}>
        <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OSM'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFitter bounds={bounds} />

          {legs.map((leg, idx) => {
            const color = LEG_COLORS[idx % LEG_COLORS.length];
            const coords = leg.routeCoordinates.map(c => [c[0], c[1]] as [number, number]);
            
            if (coords.length === 0) return null;

            const isDashed = leg.routingSource === "straight_line" || leg.routingSource === "straight_line_rail";

            // Determine sample points
            const sampleMarkers = [];
            if (leg.samples && leg.samples.length > 0) {
              const targetCount = Math.min(3, leg.samples.length);
              const step = Math.max(1, Math.floor(leg.samples.length / targetCount));
              
              for (let i = 0; i < targetCount; i++) {
                const sampleIdx = i * step;
                const sample = leg.samples[sampleIdx];
                if (sample && sample.side !== "None") {
                  const progress = sample.minutesElapsed / leg.durationMinutes;
                  const coordIdx = Math.floor(progress * (coords.length - 1));
                  if (coords[coordIdx]) {
                    sampleMarkers.push(
                      <Marker 
                        key={`sun-${idx}-${sampleIdx}`} 
                        position={coords[coordIdx]} 
                        icon={createSunIcon(sample.side as "Left" | "Right")}
                      />
                    );
                  }
                }
              }
            }

            return (
              <div key={idx}>
                <Polyline
                  positions={coords}
                  pathOptions={{
                    color,
                    weight: 4,
                    dashArray: isDashed ? "8 6" : undefined
                  }}
                />
                
                {/* Start marker for first leg */}
                {idx === 0 && <Marker position={coords[0]} icon={createCircleIcon("#22c55e")} />}
                
                {/* End marker for last leg, transfer for others */}
                {idx === legs.length - 1 ? (
                  <Marker position={coords[coords.length - 1]} icon={createCircleIcon("#ef4444")} />
                ) : (
                  <Marker position={coords[coords.length - 1]} icon={createCircleIcon("#374151")} />
                )}

                {sampleMarkers}
              </div>
            );
          })}
        </MapContainer>
      </div>

      <div className="flex flex-wrap gap-3 text-xs justify-center text-muted-foreground mt-1">
        {legs.map((leg, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className="w-3 h-1 rounded" style={{ backgroundColor: LEG_COLORS[idx % LEG_COLORS.length] }}></div>
            <span>Leg {idx + 1} ({leg.vehicleType})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
