import { useState, useRef, useEffect } from "react";
import { Sun } from "lucide-react";
import type { LegResultSunSide } from "@workspace/api-client-react";

interface VehicleDiagramProps {
  vehicleType: string;
  sunSide: LegResultSunSide | "None";
  sunPercentLeft?: number;
  sunPercentRight?: number;
  samples?: Array<{
    minutesElapsed: number;
    side: "Left" | "Right" | "None";
  }>;
  /** When set (from timeline hover), temporarily overrides sunSide for highlighting */
  activeSide?: "Left" | "Right" | "None" | null;
}

export function VehicleDiagram({
  vehicleType,
  sunSide,
  sunPercentLeft = 0,
  sunPercentRight = 0,
  activeSide,
}: VehicleDiagramProps) {
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // The effective side used for coloring — activeSide (from timeline hover) takes priority
  const effectiveSide: "Left" | "Right" | "None" =
    activeSide != null ? activeSide : sunSide;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setSelectedSeat(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getSeatColor = (side: "Left" | "Right" | "None") => {
    if (effectiveSide === side && side !== "None") return "rgba(251, 146, 60, 0.75)";
    if (side !== "None" && effectiveSide !== "None") return "rgba(100, 149, 237, 0.2)";
    return "rgba(156, 163, 175, 0.4)";
  };

  const handleSeatClick = (seatId: string, _side: "Left" | "Right" | "None", e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSeat(selectedSeat === seatId ? null : seatId);
  };

  const renderTooltip = (seatId: string, side: "Left" | "Right" | "None", x: number, y: number) => {
    if (selectedSeat !== seatId) return null;
    let text = "Neutral seat";
    if (sunSide === side && side !== "None") {
      const pct = side === "Left" ? sunPercentLeft : sunPercentRight;
      text = `Sun side — sun for ~${pct}% of the ride`;
    } else if (side !== "None" && sunSide !== "None") {
      text = "Shade side — stays shaded for most of this leg";
    }
    return (
      <div
        className="absolute z-50 bg-popover text-popover-foreground text-xs p-2 rounded shadow-md border border-border pointer-events-none w-48 text-center"
        style={{ left: x, top: y, transform: "translate(-50%, -100%)", marginTop: "-10px" }}
      >
        {text}
      </div>
    );
  };

  const renderBus = () => (
    <svg width="120" height="280" viewBox="0 0 120 280" className="mx-auto overflow-visible">
      <rect x="5" y="40" width="10" height="20" rx="2" fill="#333" />
      <rect x="105" y="40" width="10" height="20" rx="2" fill="#333" />
      <rect x="5" y="220" width="10" height="20" rx="2" fill="#333" />
      <rect x="105" y="220" width="10" height="20" rx="2" fill="#333" />
      <rect x="10" y="10" width="100" height="260" rx="15" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="15" y="15" width="90" height="25" rx="5" fill="#94a3b8" />
      <rect x="20" y="260" width="80" height="5" rx="2" fill="#ef4444" />
      <rect x="12" y="50" width="4" height="200" rx="2" fill="#e2e8f0" />
      <rect x="104" y="50" width="4" height="200" rx="2" fill="#e2e8f0" />
      <g onClick={(e) => handleSeatClick("driver", "Left", e)} className="cursor-pointer">
        <rect x="20" y="50" width="25" height="20" rx="4" fill={getSeatColor("Left")} />
        {renderTooltip("driver", "Left", 32, 50)}
      </g>
      {[0, 1, 2, 3, 4].map((row) => {
        const y = 80 + row * 35;
        return (
          <g key={`row-${row}`}>
            <g onClick={(e) => handleSeatClick(`L-${row}`, "Left", e)} className="cursor-pointer">
              <rect x="20" y={y} width="25" height="20" rx="4" fill={getSeatColor("Left")} />
              {renderTooltip(`L-${row}`, "Left", 32, y)}
            </g>
            <g onClick={(e) => handleSeatClick(`R-${row}`, "Right", e)} className="cursor-pointer">
              <rect x="75" y={y} width="25" height="20" rx="4" fill={getSeatColor("Right")} />
              {renderTooltip(`R-${row}`, "Right", 87, y)}
            </g>
          </g>
        );
      })}
    </svg>
  );

  const renderMicrobus = () => (
    <svg width="100" height="230" viewBox="0 0 100 230" className="mx-auto overflow-visible">
      <rect x="2" y="30" width="8" height="18" rx="2" fill="#333" />
      <rect x="90" y="30" width="8" height="18" rx="2" fill="#333" />
      <rect x="2" y="180" width="8" height="18" rx="2" fill="#333" />
      <rect x="90" y="180" width="8" height="18" rx="2" fill="#333" />
      <rect x="10" y="10" width="80" height="210" rx="12" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="15" y="15" width="70" height="20" rx="5" fill="#94a3b8" />
      {[0, 1, 2, 3].map((row) => {
        const y = 50 + row * 40;
        return (
          <g key={`row-${row}`}>
            <g onClick={(e) => handleSeatClick(`L-${row}`, "Left", e)} className="cursor-pointer">
              <rect x="18" y={y} width="25" height="20" rx="4" fill={getSeatColor("Left")} />
              {renderTooltip(`L-${row}`, "Left", 30, y)}
            </g>
            <g onClick={(e) => handleSeatClick(`R-${row}`, "Right", e)} className="cursor-pointer">
              <rect x="57" y={y} width="25" height="20" rx="4" fill={getSeatColor("Right")} />
              {renderTooltip(`R-${row}`, "Right", 70, y)}
            </g>
          </g>
        );
      })}
    </svg>
  );

  const renderCar = () => (
    <svg width="90" height="200" viewBox="0 0 90 200" className="mx-auto overflow-visible">
      <rect x="0" y="35" width="10" height="20" rx="2" fill="#333" />
      <rect x="80" y="35" width="10" height="20" rx="2" fill="#333" />
      <rect x="0" y="145" width="10" height="20" rx="2" fill="#333" />
      <rect x="80" y="145" width="10" height="20" rx="2" fill="#333" />
      <path d="M 15 20 C 15 5, 75 5, 75 20 L 80 180 C 80 195, 10 195, 10 180 Z" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M 20 60 Q 45 45 70 60 L 65 75 Q 45 70 25 75 Z" fill="#94a3b8" />
      <path d="M 25 140 Q 45 145 65 140 L 70 155 Q 45 160 20 155 Z" fill="#94a3b8" />
      <g onClick={(e) => handleSeatClick("L-front", "Left", e)} className="cursor-pointer">
        <rect x="22" y="85" width="20" height="20" rx="4" fill={getSeatColor("Left")} />
        {renderTooltip("L-front", "Left", 32, 85)}
      </g>
      <g onClick={(e) => handleSeatClick("R-front", "Right", e)} className="cursor-pointer">
        <rect x="48" y="85" width="20" height="20" rx="4" fill={getSeatColor("Right")} />
        {renderTooltip("R-front", "Right", 58, 85)}
      </g>
      <g onClick={(e) => handleSeatClick("L-back", "Left", e)} className="cursor-pointer">
        <rect x="22" y="115" width="20" height="20" rx="4" fill={getSeatColor("Left")} />
        {renderTooltip("L-back", "Left", 32, 115)}
      </g>
      <g onClick={(e) => handleSeatClick("R-back", "Right", e)} className="cursor-pointer">
        <rect x="48" y="115" width="20" height="20" rx="4" fill={getSeatColor("Right")} />
        {renderTooltip("R-back", "Right", 58, 115)}
      </g>
    </svg>
  );

  const renderTrain = () => (
    <svg width="100" height="300" viewBox="0 0 100 300" className="mx-auto overflow-visible">
      <rect x="10" y="10" width="80" height="280" rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="15" y="15" width="70" height="15" rx="2" fill="#94a3b8" />
      <rect x="15" y="270" width="70" height="15" rx="2" fill="#94a3b8" />
      <g onClick={(e) => handleSeatClick("L-bench", "Left", e)} className="cursor-pointer">
        <rect x="15" y="40" width="15" height="220" rx="2" fill={getSeatColor("Left")} />
        {renderTooltip("L-bench", "Left", 22, 150)}
      </g>
      <g onClick={(e) => handleSeatClick("R-bench", "Right", e)} className="cursor-pointer">
        <rect x="70" y="40" width="15" height="220" rx="2" fill={getSeatColor("Right")} />
        {renderTooltip("R-bench", "Right", 77, 150)}
      </g>
    </svg>
  );

  const renderMetro = () => (
    <svg width="100" height="260" viewBox="0 0 100 260" className="mx-auto overflow-visible">
      <rect x="10" y="10" width="80" height="240" rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="15" y="15" width="70" height="15" rx="2" fill="#94a3b8" />
      <rect x="15" y="230" width="70" height="15" rx="2" fill="#94a3b8" />
      <g onClick={(e) => handleSeatClick("L-bench", "Left", e)} className="cursor-pointer">
        <rect x="15" y="40" width="15" height="180" rx="2" fill={getSeatColor("Left")} />
        {renderTooltip("L-bench", "Left", 22, 130)}
      </g>
      <g onClick={(e) => handleSeatClick("R-bench", "Right", e)} className="cursor-pointer">
        <rect x="70" y="40" width="15" height="180" rx="2" fill={getSeatColor("Right")} />
        {renderTooltip("R-bench", "Right", 77, 130)}
      </g>
    </svg>
  );

  const renderVehicle = () => {
    switch (vehicleType) {
      case "Bus": return renderBus();
      case "Microbus": return renderMicrobus();
      case "Car": return renderCar();
      case "Train": return renderTrain();
      case "Metro": return renderMetro();
      default: return renderBus();
    }
  };

  return (
    <div className="relative mx-auto my-6 flex justify-center" ref={containerRef}>
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-muted-foreground/30">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </div>

      <div className="relative transition-all duration-200">
        {renderVehicle()}

        {effectiveSide === "Left" && (
          <div className="absolute top-1/2 -left-12 -translate-y-1/2 text-amber-500 pointer-events-none transition-all duration-200" style={{ animation: activeSide ? "none" : undefined }}>
            <Sun className={`w-8 h-8 fill-amber-500/20 ${activeSide ? "" : "animate-pulse"}`} />
          </div>
        )}
        {effectiveSide === "Right" && (
          <div className="absolute top-1/2 -right-12 -translate-y-1/2 text-amber-500 pointer-events-none transition-all duration-200">
            <Sun className={`w-8 h-8 fill-amber-500/20 ${activeSide ? "" : "animate-pulse"}`} />
          </div>
        )}
      </div>
    </div>
  );
}
