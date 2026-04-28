// Minimal UTC cron-expression matcher. Used only for documenting fetcher
// schedules - production cron is handled externally (Railway / GH Actions).
// Supports 5-field expressions: minute hour dayOfMonth month dayOfWeek.
// `*`, single value, range `a-b`, step `*/n`. No L/W/# extensions.

export interface CronExpr {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

const FIELDS: Array<{ name: keyof CronExpr; min: number; max: number }> = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'dayOfWeek', min: 0, max: 6 },
];

export function parseCron(expr: string): CronExpr {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expr}"`);
  }
  const out: Partial<CronExpr> = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const field = FIELDS[i]!;
    const part = parts[i]!;
    out[field.name] = expandField(part, field.min, field.max);
  }
  return out as CronExpr;
}

function expandField(part: string, min: number, max: number): number[] {
  const values = new Set<number>();
  for (const segment of part.split(',')) {
    let step = 1;
    let range = segment;
    const stepIdx = segment.indexOf('/');
    if (stepIdx >= 0) {
      step = Number.parseInt(segment.slice(stepIdx + 1), 10);
      range = segment.slice(0, stepIdx);
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`Invalid cron step in "${segment}"`);
      }
    }
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const dashIdx = range.indexOf('-');
      if (dashIdx >= 0) {
        lo = Number.parseInt(range.slice(0, dashIdx), 10);
        hi = Number.parseInt(range.slice(dashIdx + 1), 10);
      } else {
        lo = hi = Number.parseInt(range, 10);
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < min || hi > max || lo > hi) {
        throw new Error(`Invalid cron range "${segment}" for [${min}-${max}]`);
      }
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return Array.from(values).sort((a, b) => a - b);
}

export function cronMatches(expr: CronExpr, when: Date): boolean {
  return (
    expr.minute.includes(when.getUTCMinutes()) &&
    expr.hour.includes(when.getUTCHours()) &&
    expr.dayOfMonth.includes(when.getUTCDate()) &&
    expr.month.includes(when.getUTCMonth() + 1) &&
    expr.dayOfWeek.includes(when.getUTCDay())
  );
}
