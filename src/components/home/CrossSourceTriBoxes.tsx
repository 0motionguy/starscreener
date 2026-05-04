// "Cross-source · 3 boxes" home-page strip — replaces the legacy
// CrossSourceBuzz vertical list. Three small panels side-by-side, each
// showing the top 7 movers in its surface so the home page tells the
// reader at a glance: what repos are gaining, which skills are spiking,
// which MCP servers are breaking out — all in one row of dense terminal
// chrome that matches the v3 panel style used across listing pages.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import type { EcosystemLeaderboardItem } from "@/lib/ecosystem-leaderboards";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { mcpEntityLogoUrl, repoLogoUrl, resolveLogoUrl } from "@/lib/logos";

interface CrossSourceTriBoxesProps {
  repos: Repo[];
  /** null = data source unavailable; box falls back to a derived
   *  `Repos · 7d gainers` view so the home strip is always populated. */
  skills: EcosystemLeaderboardItem[] | null;
  /** null = data source unavailable; box falls back to `Repos · most stars`. */
  mcp: EcosystemLeaderboardItem[] | null;
  /** Top-N per box. Default 7. */
  limit?: number;
}

interface BoxRow {
  /** Stable key. */
  id: string;
  /** Primary line — repo full name / skill title / mcp title. */
  title: string;
  /** Right-aligned metric (delta, signal score, etc.). */
  value: string;
  /** Internal href (for Link) or external (for <a target="_blank">). */
  href: string;
  external?: boolean;
  /** "up" | "down" | "default" — colors the value column. */
  tone?: "up" | "down" | "default";
  /** Avatar / logo URL — null falls to a deterministic monogram. */
  logoUrl?: string | null;
  /** Entity name driving the monogram letter + hue. Defaults to title. */
  logoName?: string;
}

function formatSignedNumber(n: number): string {
  if (n > 0) return `+${n.toLocaleString("en-US")}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString("en-US")}`;
  return "0";
}

// Adapter: turn an EcosystemLeaderboardItem into a BoxRow.
//
// Logo fallback chain mirrors `ecosystemBoardToRows` so the home tri-boxes
// don't render as monograms-only just because skills.sh / GitHub-skill items
// ship `logoUrl: null`. The central MCP resolver also sanitizes stale
// registry `.invalid` URLs that can arrive in the published payload.
function ecosystemRow(item: EcosystemLeaderboardItem): BoxRow {
  const fallbackLogo =
    mcpEntityLogoUrl(item, 64) ??
    repoLogoUrl(item.linkedRepo, 40) ??
    resolveLogoUrl(item.url, item.title, 64);
  return {
    id: item.id,
    title: item.title,
    value: String(Math.round(item.signalScore)),
    href: item.url,
    external: true,
    tone: "default",
    logoUrl: fallbackLogo,
    logoName: item.title,
  };
}

// Adapter: turn a Repo into a BoxRow with a configurable metric column.
function repoRow(
  r: Repo,
  metric: "starsDelta24h" | "starsDelta7d" | "stars",
): BoxRow {
  const value =
    metric === "stars"
      ? r.stars.toLocaleString("en-US")
      : `${formatSignedNumber(
          (metric === "starsDelta7d" ? r.starsDelta7d : r.starsDelta24h) ?? 0,
        )}★`;
  const numeric =
    metric === "stars"
      ? r.stars
      : (metric === "starsDelta7d" ? r.starsDelta7d : r.starsDelta24h) ?? 0;
  return {
    id: r.fullName,
    title: r.fullName,
    value,
    href: `/repo/${r.fullName}`,
    tone: numeric > 0 ? "up" : "default",
    logoUrl: r.ownerAvatarUrl ?? repoLogoUrl(r.fullName),
    logoName: r.fullName,
  };
}

export function CrossSourceTriBoxes({
  repos,
  skills,
  mcp,
  limit = 7,
}: CrossSourceTriBoxesProps) {
  // Box 1 — repos top gainers (always real)
  const repoRows: BoxRow[] = [...repos]
    .sort((a, b) => (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0))
    .slice(0, limit)
    .map((r) => repoRow(r, "starsDelta24h"));

  // Box 2 — skills if available, else repos by 7d delta. Honest eyebrow
  // so we don't lie about what the column represents.
  const skillsAvailable = skills !== null && skills.length > 0;
  const skillRows: BoxRow[] = skillsAvailable
    ? skills!.slice(0, limit).map(ecosystemRow)
    : [...repos]
        .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
        .slice(0, limit)
        .map((r) => repoRow(r, "starsDelta7d"));
  const skillsEyebrow = skillsAvailable
    ? "// SKILLS · TOP SIGNAL"
    : "// REPOS · 7D GAINERS";
  const skillsStatus = skillsAvailable
    ? `${skillRows.length} OF ${skills!.length}`
    : `${skillRows.length} OF ${repos.length}`;

  // Box 3 — mcp if available, else repos by total stars.
  const mcpAvailable = mcp !== null && mcp.length > 0;
  const mcpRows: BoxRow[] = mcpAvailable
    ? mcp!.slice(0, limit).map(ecosystemRow)
    : [...repos]
        .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
        .slice(0, limit)
        .map((r) => repoRow(r, "stars"));
  const mcpEyebrow = mcpAvailable
    ? "// MCP · TOP SIGNAL"
    : "// REPOS · MOST STARS";
  const mcpStatus = mcpAvailable
    ? `${mcpRows.length} OF ${mcp!.length}`
    : `${mcpRows.length} OF ${repos.length}`;

  return (
    <section
      aria-label="Cross-source top movers"
      className="px-4 sm:px-6 my-6"
    >
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 gap-3 md:grid-cols-3">
        <Box
          eyebrow="// REPOS · TOP GAINERS · 24H"
          status={`${repoRows.length} OF ${repos.length}`}
          rows={repoRows}
          accent="var(--v4-acc)"
          emptyHint="no repos in window"
        />
        <Box
          eyebrow={skillsEyebrow}
          status={skillsStatus}
          rows={skillRows}
          accent="#a78bfa"
          emptyHint="no rows in window"
        />
        <Box
          eyebrow={mcpEyebrow}
          status={mcpStatus}
          rows={mcpRows}
          accent="#3ad6c5"
          emptyHint="no rows in window"
        />
      </div>
    </section>
  );
}

function Box({
  eyebrow,
  status,
  rows,
  accent,
  emptyHint,
}: {
  eyebrow: string;
  status: string;
  rows: BoxRow[];
  accent: string;
  emptyHint: string;
}) {
  return (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, var(--v4-bg-050), var(--v4-bg-000))",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
      }}
    >
      <CornerMarkers accent={accent} />

      {/* Eyebrow bar */}
      <div
        className="v2-mono flex items-center justify-between gap-3 px-3 py-2"
        style={{
          borderBottom: "1px solid var(--v4-line-100)",
          background: "var(--v4-bg-025)",
        }}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <span aria-hidden className="flex items-center gap-1">
            <Square color={accent} glow />
            <Square color="var(--v4-line-300)" />
            <Square color="var(--v4-line-300)" />
          </span>
          <span
            className="truncate text-[11px] tracking-[0.18em]"
            style={{ color: "var(--v4-ink-200)" }}
          >
            {eyebrow}
          </span>
        </span>
        <span
          className="shrink-0 text-[10px] tabular-nums tracking-[0.14em]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {status}
        </span>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div
          className="v2-mono py-6 px-3 text-center text-[10px] tracking-[0.18em]"
          style={{ color: "var(--v4-ink-500)" }}
        >
          {`// ${emptyHint}`}
        </div>
      ) : (
        <ul>
          {rows.map((row, i) => {
            const stagger = Math.min(i, 6) * 50;
            const valueColor =
              row.tone === "up"
                ? "var(--v4-money)"
                : row.tone === "down"
                  ? "var(--v4-red)"
                  : "var(--v4-ink-100)";
            const RowLink = row.external ? "a" : Link;
            const linkProps = row.external
              ? {
                  href: row.href,
                  target: "_blank" as const,
                  rel: "noopener noreferrer" as const,
                }
              : { href: row.href };

            return (
              <li
                key={row.id}
                className="v2-row group"
                style={{
                  borderBottom:
                    i === rows.length - 1
                      ? "none"
                      : "1px dashed var(--v4-line-100)",
                  animation: "slide-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
                  animationDelay: stagger > 0 ? `${stagger}ms` : undefined,
                }}
              >
                <RowLink
                  {...linkProps}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <span
                    className="font-mono text-[10px] tabular-nums shrink-0"
                    style={{ color: "var(--v4-ink-400)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <EntityLogo
                    src={row.logoUrl ?? null}
                    name={row.logoName ?? row.title}
                    size={16}
                    shape="square"
                    alt=""
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[12px] transition-colors group-hover:text-[color:var(--v4-acc)]"
                    style={{ color: "var(--v4-ink-100)" }}
                    title={row.title}
                  >
                    {row.title}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[11px] tabular-nums"
                    style={{ color: valueColor }}
                  >
                    {row.value}
                  </span>
                </RowLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CornerMarkers({ accent }: { accent: string }) {
  const corners: React.CSSProperties[] = [
    { top: -2, left: -2 },
    { top: -2, right: -2 },
    { bottom: -2, left: -2 },
    { bottom: -2, right: -2 },
  ];
  return (
    <>
      {corners.map((pos, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ width: 5, height: 5, background: accent, ...pos }}
        />
      ))}
    </>
  );
}

function Square({
  color,
  glow,
  size = 6,
}: {
  color: string;
  glow?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: size,
        height: size,
        background: color,
        borderRadius: 1,
        boxShadow: glow ? `0 0 6px ${color}55` : undefined,
      }}
    />
  );
}

export default CrossSourceTriBoxes;
