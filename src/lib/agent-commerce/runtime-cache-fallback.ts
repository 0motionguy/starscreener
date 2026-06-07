export type RuntimeCacheSource = "redis" | "file" | "memory" | "missing";

export interface RuntimeCacheFallbackDecision<T> {
  value: T | null;
  source: RuntimeCacheSource;
  shouldStore: boolean;
}

export function resolveRuntimeCacheFallback<T>(opts: {
  cached: T | null;
  cachedSource: RuntimeCacheSource | null;
  file: T | null;
}): RuntimeCacheFallbackDecision<T> {
  if (opts.cached && opts.cachedSource !== "file") {
    return {
      value: opts.cached,
      source: "memory",
      shouldStore: false,
    };
  }

  if (opts.file) {
    return {
      value: opts.file,
      source: "file",
      shouldStore: true,
    };
  }

  if (opts.cached) {
    return {
      value: opts.cached,
      source: "memory",
      shouldStore: false,
    };
  }

  return {
    value: null,
    source: "missing",
    shouldStore: false,
  };
}
