// MCP-page-specific cell renderers used by the TerminalFeedTable on /mcp.
// Namespaced under src/app/mcp/_components/ so they don't collide with the
// E agent's parallel /skills rebuild.
//
// All cells here are server-renderable (no useState/useEffect). They pull
// data from EcosystemLeaderboardItem.mcp (built in coerceMcpItem) so no
// re-fetching happens at row-render time.

import Link from "next/link";

import type {
  EcosystemLeaderboardItem,
  McpDisplayFields,
} from "@/lib/ecosystem-leaderboards";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { LivenessPill, classifyLiveness } from "@/components/signal/LivenessPill";
import { mcpEntityLogoUrl } from "@/lib/logos";

// ---------------------------------------------------------------------------
// Slug helper for the per-MCP detail route. Mirrors `slugForMcp` in
// `src/lib/mcp-detail.ts` — the resolver there decodes + lowercases. Kept
// inline here to avoid a cross-import from the cells (server component
// rendered on every row of the leaderboard).
// ---------------------------------------------------------------------------

export function slugForMcp(item: EcosystemLeaderboardItem): string {
  return encodeURIComponent((item.id ?? "").toLowerCase());
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function fmtRelativeAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const days = diff / 86_400_000;
  if (days < 1) {
    const hours = Math.max(1, Math.round(diff / 3_600_000));
    return `${hours}h ago`;
  }
  if (days < 30) return `${Math.round(days)}d ago`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Cell components
// ---------------------------------------------------------------------------

export function TerminalCellRank({ index }: { index: number }) {
  return (
    <span
      className="font-mono text-[12px] tabular-nums font-semibold"
      style={{ color: index < 10 ? "var(--v4-acc)" : "var(--v4-ink-400)" }}
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

export function TerminalCellTitle({ item }: { item: EcosystemLeaderboardItem }) {
  // Internal link to the per-MCP detail page (`/mcp/[slug]`). The previous
  // version pointed at `item.url` (external) — clicking the title now lands
  // on our own detail surface; users can still hit the upstream registry
  // via the source links rendered there.
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <EntityLogo
        src={mcpEntityLogoUrl(item, 24)}
        name={item.title}
        size={24}
        shape="square"
        alt=""
      />
      <div className="min-w-0">
        <Link
          href={`/mcp/${slugForMcp(item)}`}
          className="block truncate text-[13px] font-semibold transition-colors hover:text-[color:var(--v4-acc)]"
          style={{ color: "var(--v4-ink-100)" }}
          title={item.title}
        >
          {item.title}
        </Link>
        <div
          className="truncate text-[11px]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {item.vendor ?? item.description ?? item.linkedRepo ?? "MCP server"}
        </div>
      </div>
    </div>
  );
}

export function TerminalCellPackage({ mcp }: { mcp: McpDisplayFields | undefined }) {
  if (!mcp || !mcp.packageName) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  const reg = mcp.packageRegistry;
  const regColor =
    reg === "npm" ? "#cb3837" : reg === "pypi" ? "#3776ab" : "var(--v4-ink-400)";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        className="block truncate font-mono text-[12px]"
        style={{ color: "var(--v4-ink-100)" }}
        title={mcp.packageName}
      >
        {mcp.packageName}
      </span>
      {reg ? (
        <span
          className="v2-mono inline-flex w-fit items-center px-1 py-px text-[9px] uppercase tracking-[0.16em]"
          style={{
            border: `1px solid ${regColor}66`,
            background: `${regColor}1A`,
            color: regColor,
            borderRadius: 2,
          }}
        >
          {reg}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Weekly downloads cell. Compact number + tiny stack-bar showing the
 * npm/pypi split when both are present.
 *
 * Fallback ladder for day-1-of-deployment when the 7d window hasn't
 * accumulated yet (`downloadsCombined7d === null`):
 *   1. Sum of any per-registry 7d fields when at least one is defined.
 *   2. `npmDependents` as a usage-proxy snapshot.
 * Both fallbacks render with an "abs" subtitle so the operator knows it
 * is not a delta. Only `—` when ALL three are missing.
 */
export function TerminalCellWeeklyDownloads({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  if (!mcp) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }

  // Primary path: combined 7d downloads available.
  if (mcp.downloadsCombined7d !== null && Number.isFinite(mcp.downloadsCombined7d)) {
    const npm = mcp.npmDownloads7d ?? 0;
    const pypi = mcp.pypiDownloads7d ?? 0;
    const total = npm + pypi;
    const showSplit = npm > 0 && pypi > 0 && total > 0;
    const npmPct = showSplit ? (npm / total) * 100 : 0;

    return (
      <div className="flex flex-col items-end gap-1 tabular-nums">
        <span
          className="font-mono text-[12px] font-semibold"
          style={{ color: "var(--v4-ink-100)" }}
        >
          {fmtCompact(mcp.downloadsCombined7d)}
        </span>
        {showSplit ? (
          <div
            className="flex h-1 w-14 overflow-hidden rounded-sm"
            style={{ background: "var(--v4-bg-100)" }}
            title={`npm ${fmtCompact(npm)} · pypi ${fmtCompact(pypi)}`}
          >
            <span style={{ width: `${npmPct}%`, background: "#cb3837" }} />
            <span style={{ width: `${100 - npmPct}%`, background: "#3776ab" }} />
          </div>
        ) : null}
      </div>
    );
  }

  // Fallback 1: per-registry 7d when at least one is present.
  const hasNpm =
    typeof mcp.npmDownloads7d === "number" &&
    Number.isFinite(mcp.npmDownloads7d) &&
    mcp.npmDownloads7d > 0;
  const hasPypi =
    typeof mcp.pypiDownloads7d === "number" &&
    Number.isFinite(mcp.pypiDownloads7d) &&
    mcp.pypiDownloads7d > 0;
  if (hasNpm || hasPypi) {
    const sum = (mcp.npmDownloads7d ?? 0) + (mcp.pypiDownloads7d ?? 0);
    return (
      <span
        className="font-mono text-[12px] tabular-nums"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {fmtCompact(sum)}
        <span
          className="ml-1 text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v4-ink-500)" }}
        >
          abs
        </span>
      </span>
    );
  }

  // Fallback 2: npm dependents as a usage-proxy.
  if (
    typeof mcp.npmDependents === "number" &&
    Number.isFinite(mcp.npmDependents) &&
    mcp.npmDependents > 0
  ) {
    return (
      <span
        className="font-mono text-[12px] tabular-nums"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {fmtCompact(mcp.npmDependents)}
        <span
          className="ml-1 text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v4-ink-500)" }}
        >
          abs
        </span>
      </span>
    );
  }

  // Q3 escalation: lifetime installs from the publish payload. This is the
  // most-populated absolute snapshot today (the user's TOP-MCP sidebar
  // already proves it's there) so it rescues the largest pool of rows from
  // rendering `—`.
  if (
    typeof mcp.installsTotal === "number" &&
    Number.isFinite(mcp.installsTotal) &&
    mcp.installsTotal > 0
  ) {
    return (
      <span
        className="font-mono text-[12px] tabular-nums"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {fmtCompact(mcp.installsTotal)}
        <span
          className="ml-1 text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v4-ink-500)" }}
          title="lifetime installs (cold-start fallback)"
        >
          abs
        </span>
      </span>
    );
  }

  // Final fallback: GitHub stars. Coarsest proxy, but better than `—` when
  // no install/download data is reachable for this row.
  if (
    typeof mcp.starsTotal === "number" &&
    Number.isFinite(mcp.starsTotal) &&
    mcp.starsTotal > 0
  ) {
    return (
      <span
        className="font-mono text-[12px] tabular-nums"
        style={{ color: "var(--v4-ink-300)" }}
      >
        {fmtCompact(mcp.starsTotal)}
        <span
          className="ml-1 text-[9px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v4-ink-500)" }}
          title="GitHub stars (final fallback)"
        >
          stars
        </span>
      </span>
    );
  }

  return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
}

// ---------------------------------------------------------------------------
// Install-window cells (24h / 7d / 30d). Pre-aggregated by the worker's
// `pickMcpUsage` (MAX across pulsemcp / smithery / glama / official) and
// surfaced via McpDisplayFields.installs24h / installs7d / installs30d.
// All three render the dash fallback when null — they're the unified
// shape but each source only fills the windows it natively exposes, so
// most rows will populate one or two windows during the cold-start.
// ---------------------------------------------------------------------------

function renderInstallWindow(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  return (
    <span
      className="font-mono text-[12px] tabular-nums"
      style={{ color: "var(--v4-ink-100)" }}
    >
      {fmtCompact(value)}
    </span>
  );
}

export function TerminalCellInstalls24h({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  return renderInstallWindow(mcp?.installs24h);
}

export function TerminalCellInstalls7d({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  return renderInstallWindow(mcp?.installs7d);
}

export function TerminalCellInstalls30d({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  return renderInstallWindow(mcp?.installs30d);
}

export function TerminalCellToolCount({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  if (!mcp || mcp.toolCount === null) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  return (
    <span
      className="font-mono text-[12px] tabular-nums"
      style={{ color: "var(--v4-ink-100)" }}
    >
      {mcp.toolCount}
    </span>
  );
}

/**
 * Transports cell. Renders a short pill per transport. We can usually only
 * derive ONE transport from current data — if isStdio, show stdio; else if
 * we know transport, show it; else show "?".
 */
export function TerminalCellTransports({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  if (!mcp) return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  const transports: Array<{ label: string; tone: string }> = [];
  if (mcp.isStdio) {
    transports.push({ label: "stdio", tone: "var(--v4-ink-300)" });
  } else if (mcp.transport === "http") {
    transports.push({ label: "http", tone: "var(--v4-money)" });
  } else if (mcp.transport === "sse") {
    transports.push({ label: "sse", tone: "var(--v4-acc)" });
  } else if (mcp.transport === "streamable-http") {
    transports.push({ label: "stream", tone: "var(--v4-acc)" });
  }
  if (transports.length === 0) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {transports.map((t) => (
        <span
          key={t.label}
          className="v2-mono inline-flex items-center px-1.5 py-px text-[9px] uppercase tracking-[0.14em]"
          style={{
            border: `1px solid ${t.tone}66`,
            background: `${t.tone}1A`,
            color: t.tone,
            borderRadius: 2,
          }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

export function TerminalCellLiveness({
  item,
}: {
  item: EcosystemLeaderboardItem;
}) {
  // Re-classify so the offline-not-removed contract is enforced even when
  // the ecosystem-leaderboards layer doesn't pre-classify.
  const c = classifyLiveness(item.liveness);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <LivenessPill liveness={item.liveness} />
      {c.state !== "unknown" && c.uptime7d !== null ? (
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {(c.uptime7d * 100).toFixed(1)}%
        </span>
      ) : null}
    </div>
  );
}

export function TerminalCellLastRelease({
  mcp,
}: {
  mcp: McpDisplayFields | undefined;
}) {
  if (!mcp || !mcp.lastReleaseAt) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  return (
    <span
      className="font-mono text-[11px] tabular-nums"
      style={{ color: "var(--v4-ink-200)" }}
      title={mcp.lastReleaseAt}
    >
      {fmtRelativeAge(mcp.lastReleaseAt)}
    </span>
  );
}

// Short label per merger source slug. See apps/trendingrepo-worker/src/lib/mcp/types.ts:McpSource.
const SOURCE_LABELS: Record<string, string> = {
  official: "anthropic",
  smithery: "smithery",
  glama: "glama",
  pulsemcp: "pulsemcp",
  "awesome-mcp": "awesome",
};

/**
 * Registries cell. When the publish payload carries `mcp.sources` (the
 * merger's per-source list), render one short pill per registry. Falls
 * back to a `<count> regs` badge for legacy payloads that don't include
 * the array yet. The "official" verified pill always renders when set.
 */
export function TerminalCellRegistries({
  item,
}: {
  item: EcosystemLeaderboardItem;
}) {
  const count = item.crossSourceCount;
  const sources = item.mcp?.sources ?? [];
  const showVerified = item.verified;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {sources.length > 0 ? (
        sources.map((src) => (
          <span
            key={src}
            className="v2-mono inline-flex items-center px-1.5 py-px text-[9px] uppercase tracking-[0.14em]"
            style={{
              border: "1px solid var(--v4-line-200)",
              background: "var(--v4-bg-100)",
              color: "var(--v4-ink-200)",
              borderRadius: 2,
            }}
            title={`Listed in ${src}`}
          >
            {SOURCE_LABELS[src] ?? src}
          </span>
        ))
      ) : (
        <span
          className="v2-mono inline-flex items-center px-1.5 py-px text-[9px] uppercase tracking-[0.14em]"
          style={{
            border: "1px solid var(--v4-line-200)",
            background: "var(--v4-bg-100)",
            color: "var(--v4-ink-200)",
            borderRadius: 2,
          }}
          title={`Listed in ${count} registr${count === 1 ? "y" : "ies"}`}
        >
          {count} reg{count === 1 ? "" : "s"}
        </span>
      )}
      {showVerified ? (
        <span
          className="v2-mono inline-flex items-center px-1.5 py-px text-[9px] uppercase tracking-[0.14em]"
          style={{
            border: "1px solid var(--v4-money)66",
            background: "var(--v4-money)1A",
            color: "var(--v4-money)",
            borderRadius: 2,
          }}
          title="Official vendor"
        >
          official
        </span>
      ) : null}
    </div>
  );
}

export function TerminalCellHotness({
  item,
}: {
  item: EcosystemLeaderboardItem;
}) {
  // Prefer pre-cross-domain rawScore (`hotness`) when populated; fall back
  // to signalScore (cross-domain momentum) when not. Either way the cell
  // renders an integer 0-100 in the page accent.
  const value =
    typeof item.hotness === "number" ? item.hotness : item.signalScore;
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  return (
    <span
      className="font-mono text-[13px] font-semibold tabular-nums"
      style={{ color: "var(--v4-ink-000)" }}
    >
      {Math.round(value)}
    </span>
  );
}

// Optional alternate title cell that links to an internal repo page when
// possible — kept here so the page stays declarative.
export function TerminalCellLinkedRepo({
  item,
}: {
  item: EcosystemLeaderboardItem;
}) {
  if (!item.linkedRepo) {
    return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
  }
  return (
    <Link
      href={`/repo/${item.linkedRepo}`}
      className="block truncate font-mono text-[11px] hover:underline"
      style={{ color: "var(--v4-money)" }}
      title={item.linkedRepo}
    >
      {item.linkedRepo}
    </Link>
  );
}
