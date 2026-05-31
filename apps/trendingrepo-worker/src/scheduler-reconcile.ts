import type { Fetcher } from './lib/types.js';

export interface SchedulerDiff {
  toStart: Fetcher[];
  toStop: string[];
  unchanged: string[];
}

export function diffScheduledFetchers(
  currentNames: Iterable<string>,
  desiredFetchers: Fetcher[],
): SchedulerDiff {
  const current = new Set(currentNames);
  const desired = new Set(desiredFetchers.map((fetcher) => fetcher.name));

  return {
    toStart: desiredFetchers.filter((fetcher) => !current.has(fetcher.name)),
    toStop: [...current].filter((name) => !desired.has(name)).sort(),
    unchanged: [...current].filter((name) => desired.has(name)).sort(),
  };
}
