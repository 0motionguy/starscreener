// Entitlements — tier-gating stub.
//
// This module is a temporary local stub. A parallel agent owns the real
// entitlements / pricing surface (see CLAUDE.md handoff note). When that
// lands, delete this file and import from the shared module — the
// signature (`canUseFeature(userId, key)`) is intentionally identical so
// call sites don't have to change.
//
// While the stub is live:
//
//   - `canUseFeature(userId, "mcp.usage-reports")`
//       • returns TRUE in development (loud one-shot warn once)
//       • in production, gates on MCP_USAGE_REPORTS_USERS — a comma-
//         separated allow-list of userIds. Empty/unset → deny.
//
// Callers MUST treat the result as advisory for mixing `summary-only` vs.
// `full records` access; they should not rely on it for hard auth (the
// underlying endpoint is already user-auth'd via verifyUserAuth).

/** Feature keys recognised by the stub. Extend as needed. */
export type FeatureKey = "mcp.usage-reports";

let devFallbackWarned = false;

export function canUseFeature(userId: string, key: FeatureKey): boolean {
  if (typeof userId !== "string" || userId.trim().length === 0) return false;

  if (key === "mcp.usage-reports") {
    if (process.env.NODE_ENV !== "production") {
      if (!devFallbackWarned) {
        devFallbackWarned = true;

        console.warn(
          "[entitlements:stub] canUseFeature -> true in development. " +
            "Replace src/lib/mcp/entitlements.ts with the real module before deploy.",
        );
      }
      return true;
    }
    const raw = process.env.MCP_USAGE_REPORTS_USERS;
    if (!raw) return false;
    const allow = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return allow.includes(userId.trim());
  }

  return false;
}

/** Test-only hook to clear the one-shot dev warning flag between cases. */
export function __resetEntitlementsStubForTests(): void {
  devFallbackWarned = false;
}
