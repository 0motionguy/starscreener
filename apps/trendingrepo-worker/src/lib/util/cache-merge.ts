export type RowCompare<T> = (a: T, b: T) => number;

export type RowKey<T> = (row: T) => string | null;

export interface MergeAndCapOptions<T> {
  existing: readonly T[];
  fresh: readonly T[];
  key: RowKey<T>;
  compare: RowCompare<T>;
  max: number;
}

export function mergeAndCap<T>(opts: MergeAndCapOptions<T>): T[] {
  const map = new Map<string, T>();

  for (const row of opts.existing) {
    const key = opts.key(row);
    if (key) map.set(key, row);
  }

  for (const row of opts.fresh) {
    const key = opts.key(row);
    if (key) map.set(key, row);
  }

  return Array.from(map.values()).sort(opts.compare).slice(0, opts.max);
}

export function shouldPreserveCache<T>(args: {
  fresh: readonly T[];
  existing: readonly T[];
}): boolean {
  return args.fresh.length === 0 && args.existing.length > 0;
}

export function caseInsensitiveKey<T>(field: keyof T): RowKey<T> {
  return (row: T): string => {
    const value = row[field];
    return typeof value === "string" ? value.toLowerCase() : "";
  };
}
