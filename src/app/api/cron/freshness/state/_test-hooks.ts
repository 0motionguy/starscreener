// Test seam for src/app/api/cron/freshness/state/route.ts.
//
// Lives in a sibling file (not route.ts) because Next.js's app-router
// type validator rejects any export from a route module that isn't one of
// the recognized route handlers (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS,
// generateStaticParams, etc.). Exporting `__set/__resetInspectSourceForTests`
// directly from route.ts produced TS2344 in `.next/types/.../route.ts`.
//
// Identified in docs/forensic/07-VERIFICATION-AUDIT-SPRINT-1.md (CTO audit).

// Use `unknown` for the override so callers' real signatures (with concrete
// SourceSpec/SourceState types) bind to the generic `T` without an extends
// clause forcing assignment. resolveInspectSource is the only typed boundary.
let _override: unknown = null;

/**
 * Returns the test override (if set) or the production default. Call this at
 * use-time, NOT at module load, so test overrides applied after import are
 * still picked up.
 */
export function resolveInspectSource<T>(defaultFn: T): T {
  return ((_override as T | null) ?? defaultFn) as T;
}

export function __setInspectSourceForTests<T>(fn: T): void {
  _override = fn;
}

export function __resetInspectSourceForTests(): void {
  _override = null;
}
