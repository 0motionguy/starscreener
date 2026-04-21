// Squarified treemap layout — Bruls, Huijsmans, van Wijk (2000).
//
// Tiles a rectangle with N child rectangles whose AREAS are proportional
// to the input values, while keeping each child's aspect ratio as close to
// 1 as possible (no long thin slivers). O(n log n).
//
// Pure function: input data + bounds in, rect array out. Reused by the
// SubredditHeatMapCanvas which re-runs the layout whenever the user toggles
// window / sort / scale.

export interface TreemapInput {
  id: string;
  /** Non-negative weight. Zero is allowed but contributes no area. */
  value: number;
}

export interface TreemapRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapOptions {
  width: number;
  height: number;
  /** Inner gap subtracted from every cell on each side. Default 1. */
  padding?: number;
}

/** Bounding box still available for the next row. Mutated in place by layoutRow. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Worst aspect ratio in `row` if we lay it out along the shorter side `side`.
 * `sum` is the sum of normalized areas in `row`. Smaller = closer to square.
 */
function worst(row: number[], sum: number, side: number): number {
  if (row.length === 0 || sum <= 0 || side <= 0) return Infinity;
  let rMax = -Infinity;
  let rMin = Infinity;
  for (const v of row) {
    if (v > rMax) rMax = v;
    if (v < rMin) rMin = v;
  }
  const s2 = sum * sum;
  const w2 = side * side;
  // max( (w² · rMax) / sum² , sum² / (w² · rMin) )
  return Math.max((w2 * rMax) / s2, s2 / (w2 * rMin));
}

/**
 * Lay out `row` (whose total normalized-area = `sum`) inside `box`,
 * stacking along the box's shorter side. Pushes finished rects to `out`
 * and shrinks `box` to remove the consumed strip.
 */
function layoutRow(
  row: { id: string; area: number }[],
  sum: number,
  box: Box,
  out: TreemapRect[],
): void {
  const horizontal = box.w >= box.h; // strip along the shorter side
  const side = horizontal ? box.h : box.w;
  const stripThickness = side > 0 ? sum / side : 0;

  if (horizontal) {
    let cursor = box.y;
    for (const item of row) {
      const cellH = side > 0 ? item.area / stripThickness : 0;
      out.push({
        id: item.id,
        x: box.x,
        y: cursor,
        w: stripThickness,
        h: cellH,
      });
      cursor += cellH;
    }
    box.x += stripThickness;
    box.w -= stripThickness;
  } else {
    let cursor = box.x;
    for (const item of row) {
      const cellW = side > 0 ? item.area / stripThickness : 0;
      out.push({
        id: item.id,
        x: cursor,
        y: box.y,
        w: cellW,
        h: stripThickness,
      });
      cursor += cellW;
    }
    box.y += stripThickness;
    box.h -= stripThickness;
  }
}

export function squarifiedTreemap(
  inputs: TreemapInput[],
  opts: TreemapOptions,
): TreemapRect[] {
  const { width, height, padding = 1 } = opts;
  if (width <= 0 || height <= 0 || inputs.length === 0) return [];

  // Filter zero/negative — they have no area to allocate.
  const positive = inputs.filter((i) => i.value > 0);
  if (positive.length === 0) return [];

  // Sort desc, normalize so total value == width*height (cell area = px²).
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, i) => s + i.value, 0);
  const totalArea = width * height;
  const scale = totalArea / totalValue;
  const items = sorted.map((i) => ({ id: i.id, area: i.value * scale }));

  const box: Box = { x: 0, y: 0, w: width, h: height };
  const out: TreemapRect[] = [];

  let row: { id: string; area: number }[] = [];
  let rowSum = 0;

  for (const item of items) {
    const side = Math.min(box.w, box.h);
    if (side <= 0) break;

    if (row.length === 0) {
      row.push(item);
      rowSum = item.area;
      continue;
    }

    const currentWorst = worst(
      row.map((r) => r.area),
      rowSum,
      side,
    );
    const candidateWorst = worst(
      [...row.map((r) => r.area), item.area],
      rowSum + item.area,
      side,
    );

    if (candidateWorst <= currentWorst) {
      row.push(item);
      rowSum += item.area;
    } else {
      layoutRow(row, rowSum, box, out);
      row = [item];
      rowSum = item.area;
    }
  }

  if (row.length > 0) {
    layoutRow(row, rowSum, box, out);
  }

  // Apply padding inset so cells don't visually touch. Drop cells that
  // collapse to non-positive size after padding.
  if (padding > 0) {
    const padded: TreemapRect[] = [];
    for (const r of out) {
      const w = r.w - padding * 2;
      const h = r.h - padding * 2;
      if (w > 0 && h > 0) {
        padded.push({
          id: r.id,
          x: r.x + padding,
          y: r.y + padding,
          w,
          h,
        });
      }
    }
    return padded;
  }

  return out;
}
