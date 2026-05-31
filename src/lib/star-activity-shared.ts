// Client-safe star-activity types and chart-prep helpers.

export interface StarActivityPoint {
  d: string;       // YYYY-MM-DD (UTC bucket)
  s: number;       // cumulative stars at end of day
  delta: number;   // s - prev.s
}

export interface StarActivityPayload {
  repoId: string;
  points: StarActivityPoint[];
  firstObservedAt: string;
  backfillSource: "stargazer-api" | "snapshot-only" | "dual-ended";
  coversFirstStar: boolean;
  updatedAt: string;
}

export type StarActivityMode = "date" | "timeline";
export type StarActivityScale = "lin" | "log";
export type StarActivityMetric = "stars" | "velocity" | "mindshare";
export type StarActivityWindow =
  | "7d"
  | "30d"
  | "90d"
  | "6m"
  | "1y"
  | "all";

const WINDOW_DAYS: Record<StarActivityWindow, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "6m": 180,
  "1y": 365,
  all: null,
};

export function filterPayloadByWindow(
  payload: StarActivityPayload,
  window: StarActivityWindow,
): StarActivityPayload {
  const days = WINDOW_DAYS[window];
  if (days === null || payload.points.length === 0) return payload;
  const cutoffMs = Date.now() - days * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const filtered = payload.points.filter((p) => p.d >= cutoff);
  return { ...payload, points: filtered };
}

export function computeVelocitySeries(payload: StarActivityPayload): number[] {
  const out: number[] = new Array(payload.points.length);
  const window = 7;
  for (let i = 0; i < payload.points.length; i++) {
    const start = Math.max(0, i - (window - 1));
    let sum = 0;
    for (let j = start; j <= i; j++) sum += payload.points[j].delta;
    out[i] = sum / (i - start + 1);
  }
  return out;
}

export function computeMindshareSeries(
  selfPayload: StarActivityPayload,
  siblingPayloads: StarActivityPayload[],
): Map<string, number> {
  const totalsByDay = new Map<string, number>();
  for (const sibling of siblingPayloads) {
    for (const p of sibling.points) {
      totalsByDay.set(p.d, (totalsByDay.get(p.d) ?? 0) + p.s);
    }
  }

  const out = new Map<string, number>();
  for (const p of selfPayload.points) {
    const total = totalsByDay.get(p.d) ?? p.s;
    out.set(p.d, total > 0 ? (p.s / total) * 100 : 0);
  }
  return out;
}

export interface ChartPoint {
  x: number;
  y: number;
  stars: number;
}

export interface ChartSeries {
  repoId: string;
  points: ChartPoint[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function deriveChartSeries(
  payload: StarActivityPayload,
  mode: StarActivityMode = "date",
  scale: StarActivityScale = "lin",
): ChartSeries {
  if (payload.points.length === 0) {
    return {
      repoId: payload.repoId,
      points: [],
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
    };
  }

  const firstMs = parseDayMs(payload.points[0].d);
  const points: ChartPoint[] = payload.points.map((p) => {
    const dayMs = parseDayMs(p.d);
    const x = mode === "timeline" ? (dayMs - firstMs) / 86_400_000 : dayMs;
    const y = scale === "log" ? Math.log10(Math.max(1, p.s)) : p.s;
    return { x, y, stars: p.s };
  });

  let xMin = points[0].x;
  let xMax = points[0].x;
  let yMin = points[0].y;
  let yMax = points[0].y;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }

  return { repoId: payload.repoId, points, xMin, xMax, yMin, yMax };
}

function parseDayMs(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}
