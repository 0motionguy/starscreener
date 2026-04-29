// Side-effect-free env helpers.
//
// Lives outside src/lib/env.ts so files in the pipeline / route handlers
// can read env vars without dragging in env.ts's boot-time Zod schema
// validation + production fail-closed throw. Tests dynamically flip
// NODE_ENV per case; if a new import path forced env.ts to validate
// while NODE_ENV=production but CRON_SECRET=undefined, the test would
// die at module load instead of the assertion line.

const _warnedLegacy = new Set<string>();

/**
 * Read an environment variable with brand-migration back-compat.
 *
 * Resolution order:
 *   1. process.env[newName] — preferred, no warning.
 *   2. process.env[oldName] — accepted, logs a one-time deprecation warning.
 *
 * Returns undefined when neither is set. Always returns string-or-undefined,
 * matching `process.env.X` semantics so callers like
 * `readEnv(...) === "true"` keep working untouched.
 */
export function readEnv(
  newName: string,
  oldName: string,
): string | undefined {
  const next = process.env[newName];
  if (next !== undefined) return next;
  const legacy = process.env[oldName];
  if (legacy !== undefined && !_warnedLegacy.has(oldName)) {
    _warnedLegacy.add(oldName);
    console.warn(
      `[env] ${oldName} is deprecated, please rename to ${newName}. The old name will be removed in a future release.`,
    );
  }
  return legacy;
}
