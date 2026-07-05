interface SegmentItem {
  durationMinutes: number;
  headingLabel: string;
  sunSide: "Left" | "Right" | "None";
}

interface SunTimelineProps {
  segmentBreakdown: SegmentItem[];
  totalDurationMinutes: number;
  activeSegmentIdx: number | null;
  onSegmentHover: (idx: number | null) => void;
}

function segmentColors(side: string) {
  if (side === "Left")
    return { bar: "bg-amber-400", ring: "ring-amber-600", label: "text-amber-800", dot: "bg-amber-400" };
  if (side === "Right")
    return { bar: "bg-sky-400", ring: "ring-sky-600", label: "text-sky-800", dot: "bg-sky-400" };
  return { bar: "bg-slate-300", ring: "ring-slate-500", label: "text-slate-500", dot: "bg-slate-300" };
}

function fmtDuration(min: number): string {
  const r = Math.round(min);
  if (r < 1) return "< 1 min";
  return `~${r} min`;
}

export function SunTimeline({
  segmentBreakdown,
  totalDurationMinutes,
  activeSegmentIdx,
  onSegmentHover,
}: SunTimelineProps) {
  if (!segmentBreakdown || segmentBreakdown.length === 0) return null;

  const total =
    totalDurationMinutes ||
    segmentBreakdown.reduce((s, seg) => s + seg.durationMinutes, 0);

  const segs = segmentBreakdown.map((seg, idx) => ({
    ...seg,
    idx,
    widthPct: (seg.durationMinutes / total) * 100,
  }));

  const sidesPresent = new Set(segs.map((s) => s.sunSide));

  return (
    <div className="mt-3 mb-1 select-none">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 justify-center">
        {sidesPresent.has("Left") && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            Sun on Left
          </div>
        )}
        {sidesPresent.has("Right") && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
            Sun on Right
          </div>
        )}
        {sidesPresent.has("None") && sidesPresent.size === 1 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
            No direct sun
          </div>
        )}
      </div>

      {/* Bar */}
      <div className="flex gap-0.5 h-9 rounded-xl overflow-hidden shadow-sm">
        {segs.map((seg) => {
          const c = segmentColors(seg.sunSide);
          const isActive = activeSegmentIdx === seg.idx;
          return (
            <div
              key={seg.idx}
              title={`${seg.sunSide === "None" ? "No sun" : `Sun on ${seg.sunSide}`} · ${fmtDuration(seg.durationMinutes)} heading ${seg.headingLabel}`}
              className={[
                "relative flex items-center justify-center cursor-pointer transition-all duration-150",
                c.bar,
                isActive ? `ring-2 ring-inset ring-white/60 brightness-110` : "hover:brightness-105",
              ].join(" ")}
              style={{ width: `${seg.widthPct}%`, minWidth: 3 }}
              onMouseEnter={() => onSegmentHover(seg.idx)}
              onMouseLeave={() => onSegmentHover(null)}
              onTouchStart={() => onSegmentHover(activeSegmentIdx === seg.idx ? null : seg.idx)}
            />
          );
        })}
      </div>

      {/* Labels below each segment */}
      <div className="flex gap-0.5 mt-1">
        {segs.map((seg) => {
          const isActive = activeSegmentIdx === seg.idx;
          const showDur = seg.widthPct > 9;
          const showHeading = seg.widthPct > 18;
          return (
            <div
              key={seg.idx}
              className={`text-center transition-opacity duration-150 overflow-hidden ${isActive ? "opacity-100" : "opacity-60"}`}
              style={{ width: `${seg.widthPct}%`, minWidth: 3 }}
            >
              {showDur && (
                <p className="text-[9px] leading-tight truncate text-muted-foreground px-0.5">
                  {fmtDuration(seg.durationMinutes)}
                </p>
              )}
              {showHeading && (
                <p className="text-[9px] leading-tight truncate text-muted-foreground/70 px-0.5 capitalize">
                  {seg.headingLabel}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Hover detail pill */}
      <div
        className={`mt-2 overflow-hidden transition-all duration-200 ${
          activeSegmentIdx !== null ? "max-h-10 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {activeSegmentIdx !== null && segmentBreakdown[activeSegmentIdx] && (
          <div className="text-xs text-center bg-secondary/60 rounded-lg py-1.5 px-3 text-foreground">
            {(() => {
              const seg = segmentBreakdown[activeSegmentIdx];
              const side =
                seg.sunSide === "None" ? "No direct sun" : `Sun on the ${seg.sunSide}`;
              return `${side} · ${fmtDuration(seg.durationMinutes)} heading ${seg.headingLabel}`;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
