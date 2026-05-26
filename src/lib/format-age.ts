// Shared relative-time helper used by the /repo/[owner]/[name] panels.
// Extracted from RepoPulsePanel so every repo-detail card formats
// "now / Nm ago / Nh ago / Nd ago / Nmo ago / Ny ago" identically.
//
// Returns an em-dash "—" for missing or unparseable timestamps so the
// caller can render the cell without conditional logic.

/** Relative time label like "3d ago", "2h ago", "now". */
export function ageLabel(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const ms = Math.max(0, nowMs - ts);
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
