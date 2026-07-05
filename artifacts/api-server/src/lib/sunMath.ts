import * as SunCalc from "suncalc";

export interface SunSample {
  minutesElapsed: number;
  azimuthDeg: number;
  altitudeDeg: number;
  side: "Left" | "Right" | "None";
}

export interface SunSideResult {
  sunSide: "Left" | "Right" | "None";
  sunPercentLeft: number;
  sunPercentRight: number;
  samples: SunSample[];
}

export interface SegmentBreakdownItem {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  bearingDeg: number;
  headingLabel: string;
  sunSide: "Left" | "Right" | "None";
}

export interface PolylineSunResult extends SunSideResult {
  segmentBreakdown: SegmentBreakdownItem[];
}

// ─── Math helpers ────────────────────────────────────────────────────────────

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function computeBearing(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number {
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeBearing(radToDeg(Math.atan2(y, x)));
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

function bearingToHeadingLabel(bearing: number): string {
  const b = normalizeBearing(bearing);
  if (b < 22.5 || b >= 337.5) return "north";
  if (b < 67.5) return "northeast";
  if (b < 112.5) return "east";
  if (b < 157.5) return "southeast";
  if (b < 202.5) return "south";
  if (b < 247.5) return "southwest";
  if (b < 292.5) return "west";
  return "northwest";
}

// ─── Bearing smoothing ────────────────────────────────────────────────────────

interface RawSeg {
  bearing: number;
  distanceKm: number;
  midLat: number;
  midLon: number;
}

/**
 * Smooth the bearing at index `idx` using a distance-weighted window of
 * neighbouring segments within ±WINDOW_KM. Uses sin/cos averaging to
 * handle the 0°/360° wrap-around correctly.
 */
const SMOOTH_WINDOW_KM = 0.15; // ±150 m

function smoothedBearing(segs: RawSeg[], idx: number): number {
  let sinW = 0;
  let cosW = 0;

  // Backwards from idx (inclusive)
  let dist = 0;
  for (let i = idx; i >= 0; i--) {
    const w = segs[i].distanceKm;
    const rad = (segs[i].bearing * Math.PI) / 180;
    sinW += Math.sin(rad) * w;
    cosW += Math.cos(rad) * w;
    dist += w;
    if (dist > SMOOTH_WINDOW_KM) break;
  }

  // Forwards from idx+1
  dist = 0;
  for (let i = idx + 1; i < segs.length; i++) {
    const w = segs[i].distanceKm;
    const rad = (segs[i].bearing * Math.PI) / 180;
    sinW += Math.sin(rad) * w;
    cosW += Math.cos(rad) * w;
    dist += w;
    if (dist > SMOOTH_WINDOW_KM) break;
  }

  return normalizeBearing(radToDeg(Math.atan2(sinW, cosW)));
}

// ─── Hysteresis ───────────────────────────────────────────────────────────────

/**
 * Compute Left/Right from a relative angle with a hysteresis buffer around the
 * 180° flip boundary. `prevSide` is the last decided side so we only flip when
 * the angle crosses the threshold by HYSTERESIS_DEG.
 */
const HYSTERESIS_DEG = 10;

function applyHysteresis(
  relativeAngle: number,
  prevSide: "Left" | "Right" | "None"
): "Left" | "Right" {
  if (prevSide === "None") {
    // First sample: use raw classification
    return relativeAngle <= 180 ? "Right" : "Left";
  }
  if (prevSide === "Right") {
    // Stay Right unless angle clears 180° + buffer
    return relativeAngle > 180 + HYSTERESIS_DEG ? "Left" : "Right";
  }
  // prevSide === "Left": stay Left unless angle drops below 180° - buffer
  return relativeAngle <= 180 - HYSTERESIS_DEG ? "Right" : "Left";
}

// ─── Segment post-processing (short-segment absorption + capping) ─────────────

const MIN_SEGMENT_MINUTES = 1.5;
const MAX_SEGMENTS = 5;

function weightedAvgBearing(
  bearingA: number,
  weightA: number,
  bearingB: number,
  weightB: number
): number {
  const total = weightA + weightB;
  if (total === 0) return bearingA;
  const sinAvg =
    (Math.sin((bearingA * Math.PI) / 180) * weightA +
      Math.sin((bearingB * Math.PI) / 180) * weightB) /
    total;
  const cosAvg =
    (Math.cos((bearingA * Math.PI) / 180) * weightA +
      Math.cos((bearingB * Math.PI) / 180) * weightB) /
    total;
  return normalizeBearing(radToDeg(Math.atan2(sinAvg, cosAvg)));
}

function mergeAdjacentSegments(
  a: SegmentBreakdownItem,
  b: SegmentBreakdownItem
): SegmentBreakdownItem {
  const totalDur = a.durationMinutes + b.durationMinutes;
  const dominant = a.durationMinutes >= b.durationMinutes ? a : b;
  const avgBearing = weightedAvgBearing(
    a.bearingDeg,
    a.durationMinutes,
    b.bearingDeg,
    b.durationMinutes
  );
  return {
    startMinute: Math.min(a.startMinute, b.startMinute),
    endMinute: Math.max(a.endMinute, b.endMinute),
    durationMinutes: Math.round(totalDur * 10) / 10,
    bearingDeg: Math.round(avgBearing * 10) / 10,
    headingLabel: bearingToHeadingLabel(avgBearing),
    sunSide: dominant.sunSide,
  };
}

function absorbShortSegments(segs: SegmentBreakdownItem[]): SegmentBreakdownItem[] {
  const result = [...segs];

  // Pass 1: absorb segments below MIN_SEGMENT_MINUTES into their longer neighbour
  let changed = true;
  while (changed && result.length > 1) {
    changed = false;
    let minDur = Infinity;
    let minIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (result[i].durationMinutes < minDur) {
        minDur = result[i].durationMinutes;
        minIdx = i;
      }
    }
    if (minDur >= MIN_SEGMENT_MINUTES) break;

    // Merge with the longer neighbour
    const leftDur = minIdx > 0 ? result[minIdx - 1].durationMinutes : -1;
    const rightDur = minIdx < result.length - 1 ? result[minIdx + 1].durationMinutes : -1;
    const mergeLeft = leftDur >= rightDur && leftDur >= 0;

    if (mergeLeft) {
      result[minIdx - 1] = mergeAdjacentSegments(result[minIdx - 1], result[minIdx]);
      result.splice(minIdx, 1);
    } else if (rightDur >= 0) {
      result[minIdx] = mergeAdjacentSegments(result[minIdx], result[minIdx + 1]);
      result.splice(minIdx + 1, 1);
    } else {
      break;
    }
    changed = true;
  }

  // Pass 2: cap at MAX_SEGMENTS by merging the shortest remaining segments
  while (result.length > MAX_SEGMENTS) {
    let minIdx = 0;
    for (let i = 1; i < result.length; i++) {
      if (result[i].durationMinutes < result[minIdx].durationMinutes) minIdx = i;
    }
    const leftDur = minIdx > 0 ? result[minIdx - 1].durationMinutes : -1;
    const rightDur = minIdx < result.length - 1 ? result[minIdx + 1].durationMinutes : -1;
    const mergeLeft = leftDur >= rightDur && leftDur >= 0;

    if (mergeLeft) {
      result[minIdx - 1] = mergeAdjacentSegments(result[minIdx - 1], result[minIdx]);
      result.splice(minIdx, 1);
    } else if (rightDur >= 0) {
      result[minIdx] = mergeAdjacentSegments(result[minIdx], result[minIdx + 1]);
      result.splice(minIdx + 1, 1);
    } else {
      break;
    }
  }

  return result;
}

// ─── Public: simple straight-line sun sides ───────────────────────────────────

export function computeSunSides(
  lat: number,
  lon: number,
  bearing: number,
  departureTime: Date,
  durationMinutes: number,
  sampleIntervalMinutes = 10,
  minAltitudeDeg = 7
): SunSideResult {
  const samples: SunSample[] = [];
  const numSamples = Math.max(2, Math.ceil(durationMinutes / sampleIntervalMinutes) + 1);
  let leftCount = 0;
  let rightCount = 0;

  for (let i = 0; i < numSamples; i++) {
    const minutesElapsed = Math.min(i * sampleIntervalMinutes, durationMinutes);
    const sampleTime = new Date(departureTime.getTime() + minutesElapsed * 60 * 1000);

    const pos = SunCalc.getPosition(sampleTime, lat, lon);
    const azimuthDeg = normalizeBearing(radToDeg(pos.azimuth) + 180);
    const altitudeDeg = radToDeg(pos.altitude);

    let side: "Left" | "Right" | "None";
    if (altitudeDeg < minAltitudeDeg) {
      side = "None";
    } else {
      const relativeAngle = normalizeBearing(azimuthDeg - bearing);
      side = relativeAngle <= 180 ? "Right" : "Left";
    }

    if (side === "Left") leftCount++;
    else if (side === "Right") rightCount++;

    samples.push({
      minutesElapsed,
      azimuthDeg: Math.round(azimuthDeg * 10) / 10,
      altitudeDeg: Math.round(altitudeDeg * 10) / 10,
      side,
    });
  }

  const total = samples.length;
  const sunPercentLeft = Math.round((leftCount / total) * 100);
  const sunPercentRight = Math.round((rightCount / total) * 100);
  let sunSide: "Left" | "Right" | "None";
  if (leftCount === 0 && rightCount === 0) sunSide = "None";
  else if (leftCount >= rightCount) sunSide = "Left";
  else sunSide = "Right";

  return { sunSide, sunPercentLeft, sunPercentRight, samples };
}

// ─── Public: polyline-aware sun sides ────────────────────────────────────────

export function computeSunSidesFromPolyline(
  routeCoordinates: [number, number][],
  departureTime: Date,
  durationMinutes: number,
  minAltitudeDeg = 7
): PolylineSunResult {
  // Fallback for degenerate inputs
  if (routeCoordinates.length < 2) {
    const [lat, lon] = routeCoordinates[0] ?? [0, 0];
    const fallback = computeSunSides(lat, lon, 0, departureTime, durationMinutes, 10, minAltitudeDeg);
    return { ...fallback, segmentBreakdown: [] };
  }

  // ── Step 1: Build raw segments from coordinate pairs ──────────────────────
  const rawSegs: RawSeg[] = [];
  let totalDistanceKm = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [lat1, lon1] = routeCoordinates[i];
    const [lat2, lon2] = routeCoordinates[i + 1];
    const d = haversineDistanceKm(lat1, lon1, lat2, lon2);
    if (d < 0.0001) continue;
    rawSegs.push({
      bearing: computeBearing(lat1, lon1, lat2, lon2),
      distanceKm: d,
      midLat: (lat1 + lat2) / 2,
      midLon: (lon1 + lon2) / 2,
    });
    totalDistanceKm += d;
  }

  if (rawSegs.length === 0 || totalDistanceKm === 0) {
    const [lat, lon] = routeCoordinates[0];
    const fallback = computeSunSides(lat, lon, 0, departureTime, durationMinutes, 10, minAltitudeDeg);
    return { ...fallback, segmentBreakdown: [] };
  }

  // ── Step 2: Assign duration + compute sun side per segment ─────────────────
  // Uses smoothed bearing (Bug 1 fix) and hysteresis (Bug 1 fix).
  interface TimedSeg {
    smoothedBearing: number;
    rawBearing: number;
    distanceKm: number;
    midLat: number;
    midLon: number;
    startMinute: number;
    endMinute: number;
    sunSide: "Left" | "Right" | "None";
  }

  const timedSegs: TimedSeg[] = [];
  let cumMinutes = 0;
  let prevSide: "Left" | "Right" | "None" = "None";

  for (let i = 0; i < rawSegs.length; i++) {
    const seg = rawSegs[i];
    const segDuration = (seg.distanceKm / totalDistanceKm) * durationMinutes;
    const startMinute = cumMinutes;
    const endMinute = cumMinutes + segDuration;
    const midMinute = (startMinute + endMinute) / 2;

    const sampleTime = new Date(departureTime.getTime() + midMinute * 60 * 1000);
    const bearing = smoothedBearing(rawSegs, i); // Bug 1: smooth bearing

    const pos = SunCalc.getPosition(sampleTime, seg.midLat, seg.midLon);
    const azimuthDeg = normalizeBearing(radToDeg(pos.azimuth) + 180);
    const altitudeDeg = radToDeg(pos.altitude);

    let sunSide: "Left" | "Right" | "None";
    if (altitudeDeg < minAltitudeDeg) {
      sunSide = "None";
      prevSide = "None";
    } else {
      const relativeAngle = normalizeBearing(azimuthDeg - bearing);
      sunSide = applyHysteresis(relativeAngle, prevSide); // Bug 1: hysteresis
      prevSide = sunSide;
    }

    timedSegs.push({
      smoothedBearing: bearing,
      rawBearing: seg.bearing,
      distanceKm: seg.distanceKm,
      midLat: seg.midLat,
      midLon: seg.midLon,
      startMinute,
      endMinute,
      sunSide,
    });
    cumMinutes = endMinute;
  }

  // ── Step 3: Collapse consecutive same-side segments ───────────────────────
  interface CollapseGroup {
    startMinute: number;
    sunSide: "Left" | "Right" | "None";
    bearingWeightedSum: number;
    distanceWeightSum: number;
  }

  const collapsed: SegmentBreakdownItem[] = [];
  let group: CollapseGroup | null = null;

  const flushGroup = (endMinute: number) => {
    if (!group) return;
    const avgBearing =
      group.distanceWeightSum > 0
        ? normalizeBearing(group.bearingWeightedSum / group.distanceWeightSum)
        : 0;
    const dur = endMinute - group.startMinute;
    if (dur < 0.01) return;
    collapsed.push({
      startMinute: Math.round(group.startMinute * 10) / 10,
      endMinute: Math.round(endMinute * 10) / 10,
      durationMinutes: Math.round(dur * 10) / 10,
      bearingDeg: Math.round(avgBearing * 10) / 10,
      headingLabel: bearingToHeadingLabel(avgBearing),
      sunSide: group.sunSide,
    });
  };

  for (let i = 0; i < timedSegs.length; i++) {
    const seg = timedSegs[i];
    if (!group) {
      group = {
        startMinute: seg.startMinute,
        sunSide: seg.sunSide,
        bearingWeightedSum: seg.smoothedBearing * seg.distanceKm,
        distanceWeightSum: seg.distanceKm,
      };
      continue;
    }
    if (seg.sunSide === group.sunSide) {
      group.bearingWeightedSum += seg.smoothedBearing * seg.distanceKm;
      group.distanceWeightSum += seg.distanceKm;
    } else {
      flushGroup(seg.startMinute);
      group = {
        startMinute: seg.startMinute,
        sunSide: seg.sunSide,
        bearingWeightedSum: seg.smoothedBearing * seg.distanceKm,
        distanceWeightSum: seg.distanceKm,
      };
    }
  }
  if (group) {
    flushGroup(timedSegs[timedSegs.length - 1].endMinute);
  }

  // ── Step 4: Absorb short segments and cap count (Bug 2 fix) ───────────────
  const finalBreakdown = absorbShortSegments(collapsed);

  // ── Step 5: Build samples + aggregate stats ───────────────────────────────
  const samples: SunSample[] = [];
  let leftWeightedMinutes = 0;
  let rightWeightedMinutes = 0;

  for (const seg of timedSegs) {
    const midMinute = (seg.startMinute + seg.endMinute) / 2;
    const sampleTime = new Date(departureTime.getTime() + midMinute * 60 * 1000);
    const pos = SunCalc.getPosition(sampleTime, seg.midLat, seg.midLon);
    const azimuthDeg = normalizeBearing(radToDeg(pos.azimuth) + 180);
    const altitudeDeg = radToDeg(pos.altitude);
    const segDur = seg.endMinute - seg.startMinute;

    samples.push({
      minutesElapsed: Math.round(midMinute),
      azimuthDeg: Math.round(azimuthDeg * 10) / 10,
      altitudeDeg: Math.round(altitudeDeg * 10) / 10,
      side: seg.sunSide,
    });

    if (seg.sunSide === "Left") leftWeightedMinutes += segDur;
    else if (seg.sunSide === "Right") rightWeightedMinutes += segDur;
  }

  const sunPercentLeft =
    durationMinutes > 0 ? Math.round((leftWeightedMinutes / durationMinutes) * 100) : 0;
  const sunPercentRight =
    durationMinutes > 0 ? Math.round((rightWeightedMinutes / durationMinutes) * 100) : 0;

  let sunSide: "Left" | "Right" | "None";
  if (leftWeightedMinutes === 0 && rightWeightedMinutes === 0) sunSide = "None";
  else if (leftWeightedMinutes >= rightWeightedMinutes) sunSide = "Left";
  else sunSide = "Right";

  return { sunSide, sunPercentLeft, sunPercentRight, samples, segmentBreakdown: finalBreakdown };
}
