"use client";

// AUDIT-2026-05-04 follow-up: the home page's "Live / top 50" card had
// dead static tabs (All / Repos / Skills / MCP) and no window switcher.
// User asked for a working 24h / 7d / 30d toggle and tab switching under
// the ALL section. This client component owns that interactivity.
//
// 2026-05-02 P0 follow-up: user said the table "is FUCKED" and should
// "display the INFORMATION from the OG chart". Original LiveTopTable was
// just `# / Name / Stars / 24h / Score` — no sparkline, no channels, no
// avatars. The OG terminal table has all of those. This rebuild adds:
//   - GitHub owner avatar (per-row image) so the table reads as alive
//   - Per-row sparkline (mini SVG) so each row carries its own trend
//   - Channels-firing pill (HN/R/B/D/X — count of true entries in
//     channelStatus) so cross-source momentum is visible at a glance
//   - Momentum-driven score bar (fills 0-100% of column based on
//     repo.momentumScore) so the "Score" column reads as a chart, not
//     an opaque number
//
// Server passes the pre-derived repos + ecosystem boards (skills, mcp).
// We sort client-side because the dataset is small (top ~50) and the
// toggle is a tight feedback loop.

import { useMemo, useState } from "react";
import type { Repo } from "@/lib/types";

export type LiveWindow = "24h" | "7d" | "30d";
export type LiveTab = "all" | "repos" | "skills" | "mcp";

export interface LiveSkill {
  id: string;
  name: string;
  href: string;
  sub: string;
  score: number;
  delta24h: number;
  delta7d: number;
  delta30d: number;
  /** Optional avatar / logo URL — falls back to monogram pip when absent. */
  logoUrl?: string;
  /** Optional 16-pt sparkline series. */
  sparkline?: number[];
}

export interface LiveMcp {
  id: string;
  name: string;
  href: string;
  sub: string;
  score: number;
  delta24h: number;
  delta7d: number;
  delta30d: number;
  /** Optional avatar / logo URL — falls back to monogram pip when absent. */
  logoUrl?: string;
  /** Optional 16-pt sparkline series. */
  sparkline?: number[];
}

interface Props {
  repos: Repo[];
  skills: LiveSkill[];
  mcps: LiveMcp[];
  limit?: number;
}

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number): string {
  return compactNumber.format(Math.max(0, Math.round(value))).toLowerCase();
}

function formatDelta(value: number): string {
  const abs = formatCompact(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

function deltaForWindow(repo: Repo, w: LiveWindow): number {
  if (w === "24h") return repo.starsDelta24h;
  if (w === "7d") return repo.starsDelta7d;
  return repo.starsDelta30d;
}

function skillDeltaForWindow(item: LiveSkill | LiveMcp, w: LiveWindow): number {
  if (w === "24h") return item.delta24h;
  if (w === "7d") return item.delta7d;
  return item.delta30d;
}

function sparkPath(values: number[], width: number, height: number): string {
  const points = values.length > 1 ? values : [1, 1];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function MiniSpark({
  values,
  positive,
}: {
  values: readonly number[];
  positive: boolean;
}) {
  const arr = Array.isArray(values) ? values.slice(-16) : [];
  if (arr.length < 2) {
    // Render a flat dim placeholder rather than collapsing to 0px so the
    // column width stays stable across rows.
    return (
      <svg
        width="64"
        height="18"
        viewBox="0 0 64 18"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        <line
          x1="1"
          y1="9"
          x2="63"
          y2="9"
          stroke="var(--ink-400, #8a8a8a)"
          strokeOpacity={0.35}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }
  const stroke = positive ? "var(--sig-green, #22c55e)" : "var(--sig-red, #ef4444)";
  return (
    <svg
      width="64"
      height="18"
      viewBox="0 0 64 18"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d={sparkPath([...arr], 64, 18)}
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MomentumBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    clamped >= 70
      ? "var(--sig-green, #22c55e)"
      : clamped >= 40
        ? "var(--acc, #ff6a00)"
        : "var(--ink-400, #8a8a8a)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 4,
          background: "var(--bg-050, #161616)",
          border: "1px solid var(--line-200, #1f1f1f)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${clamped}%`,
            height: "100%",
            background: tone,
          }}
        />
      </span>
      <span style={{ minWidth: 28, textAlign: "right" }}>{clamped.toFixed(0)}</span>
    </span>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  github: "GH",
  reddit: "R",
  hn: "HN",
  bluesky: "B",
  devto: "D",
  twitter: "X",
};

function ChannelsFiring({
  status,
  count,
}: {
  status?: Repo["channelStatus"];
  count?: number;
}) {
  // Prefer the per-channel pill view when we know which channels fired;
  // otherwise show a numeric badge so the column carries data either way.
  const pills = status
    ? Object.entries(status)
        .filter(([, on]) => on)
        .map(([k]) => CHANNEL_LABELS[k] ?? k.slice(0, 1).toUpperCase())
    : [];
  if (pills.length === 0 && (!count || count <= 0)) {
    return (
      <span
        style={{
          color: "var(--ink-400, #8a8a8a)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 10,
        }}
      >
        —
      </span>
    );
  }
  if (pills.length === 0) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "1px 6px",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--ink-200, #d6d6d6)",
          background: "var(--bg-050, #161616)",
          border: "1px solid var(--line-200, #1f1f1f)",
          borderRadius: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count} src
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 3,
        fontFamily: "var(--font-mono), monospace",
        fontSize: 9,
        letterSpacing: "0.04em",
      }}
    >
      {pills.map((label) => (
        <span
          key={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 16,
            padding: "1px 3px",
            color: "var(--acc, #ff6a00)",
            background: "rgba(255, 106, 0, 0.08)",
            border: "1px solid rgba(255, 106, 0, 0.4)",
            borderRadius: 2,
          }}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

function RowAvatar({ src, name }: { src?: string; name: string }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  if (!src) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: 2,
          background: "var(--bg-050, #161616)",
          border: "1px solid var(--line-200, #1f1f1f)",
          color: "var(--ink-300, #b6b6b6)",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 9,
          fontWeight: 600,
        }}
      >
        {initial}
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      width={18}
      height={18}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{
        width: 18,
        height: 18,
        borderRadius: 2,
        objectFit: "cover",
        flexShrink: 0,
        background: "var(--bg-050, #161616)",
      }}
      aria-hidden="true"
    />
  );
}

export function LiveTopTable({ repos, skills, mcps, limit = 15 }: Props) {
  const [tab, setTab] = useState<LiveTab>("all");
  const [win, setWin] = useState<LiveWindow>("24h");

  const sortedRepos = useMemo(
    () => [...repos].sort((a, b) => deltaForWindow(b, win) - deltaForWindow(a, win)),
    [repos, win],
  );
  const sortedSkills = useMemo(
    () =>
      [...skills].sort(
        (a, b) => skillDeltaForWindow(b, win) - skillDeltaForWindow(a, win),
      ),
    [skills, win],
  );
  const sortedMcps = useMemo(
    () =>
      [...mcps].sort(
        (a, b) => skillDeltaForWindow(b, win) - skillDeltaForWindow(a, win),
      ),
    [mcps, win],
  );

  return (
    <>
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "all" ? " on" : ""}`}
          onClick={() => setTab("all")}
        >
          All<span className="ct">{repos.length + skills.length + mcps.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "repos" ? " on" : ""}`}
          onClick={() => setTab("repos")}
        >
          Repos<span className="ct">{repos.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "skills" ? " on" : ""}`}
          onClick={() => setTab("skills")}
        >
          Skills<span className="ct">{skills.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "mcp" ? " on" : ""}`}
          onClick={() => setTab("mcp")}
        >
          MCP<span className="ct">{mcps.length}</span>
        </button>
        <span className="right">
          <span className="win-group" role="group" aria-label="Window">
            {(["24h", "7d", "30d"] as const).map((w) => (
              <button
                key={w}
                type="button"
                className={`tab win-tab${win === w ? " on" : ""}`}
                onClick={() => setWin(w)}
              >
                {w}
              </button>
            ))}
          </span>
          <span className="live">live</span>
        </span>
      </div>
      <div className="table-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th className="num">Stars</th>
              <th className="num">{win === "24h" ? "24h" : win === "7d" ? "7d" : "30d"}</th>
              <th>Trend</th>
              <th>Channels</th>
              <th className="num">Momentum</th>
            </tr>
          </thead>
          <tbody>
            {(tab === "all" || tab === "repos") &&
              sortedRepos.slice(0, limit).map((repo, index) => {
                const delta = deltaForWindow(repo, win);
                const avatar =
                  repo.ownerAvatarUrl ||
                  `https://github.com/${encodeURIComponent(repo.owner)}.png?size=40`;
                const channelCount =
                  repo.channelsFiring ??
                  (repo.channelStatus
                    ? Object.values(repo.channelStatus).filter(Boolean).length
                    : undefined);
                return (
                  <tr key={`r-${repo.id}`}>
                    <td>{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <a
                        href={`/repo/${repo.owner}/${repo.name}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          minHeight: 32,
                        }}
                      >
                        <RowAvatar src={avatar} name={repo.owner} />
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
                          <span>{repo.fullName}</span>
                          <small>repo / {repo.language ?? "mixed"}</small>
                        </span>
                      </a>
                    </td>
                    <td className="num">{formatCompact(repo.stars)}</td>
                    <td className={`num ${delta >= 0 ? "up" : "dn"}`}>{formatDelta(delta)}</td>
                    <td>
                      <MiniSpark values={repo.sparklineData ?? []} positive={delta >= 0} />
                    </td>
                    <td>
                      <ChannelsFiring status={repo.channelStatus} count={channelCount} />
                    </td>
                    <td className="num">
                      <MomentumBar score={repo.momentumScore} />
                    </td>
                  </tr>
                );
              })}
            {(tab === "all" || tab === "skills") &&
              sortedSkills.slice(0, limit).map((item, index) => {
                const delta = skillDeltaForWindow(item, win);
                return (
                  <tr key={`s-${item.id}`}>
                    <td>{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <a
                        href={item.href}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          minHeight: 32,
                        }}
                      >
                        <RowAvatar src={item.logoUrl} name={item.name} />
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
                          <span>{item.name}</span>
                          <small>skill / {item.sub}</small>
                        </span>
                      </a>
                    </td>
                    <td className="num">—</td>
                    <td className={`num ${delta >= 0 ? "up" : "dn"}`}>{formatDelta(delta)}</td>
                    <td>
                      <MiniSpark values={item.sparkline ?? []} positive={delta >= 0} />
                    </td>
                    <td>
                      <ChannelsFiring />
                    </td>
                    <td className="num">
                      <MomentumBar score={item.score} />
                    </td>
                  </tr>
                );
              })}
            {(tab === "all" || tab === "mcp") &&
              sortedMcps.slice(0, limit).map((item, index) => {
                const delta = skillDeltaForWindow(item, win);
                return (
                  <tr key={`m-${item.id}`}>
                    <td>{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <a
                        href={item.href}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          minHeight: 32,
                        }}
                      >
                        <RowAvatar src={item.logoUrl} name={item.name} />
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2 }}>
                          <span>{item.name}</span>
                          <small>mcp / {item.sub}</small>
                        </span>
                      </a>
                    </td>
                    <td className="num">—</td>
                    <td className={`num ${delta >= 0 ? "up" : "dn"}`}>{formatDelta(delta)}</td>
                    <td>
                      <MiniSpark values={item.sparkline ?? []} positive={delta >= 0} />
                    </td>
                    <td>
                      <ChannelsFiring />
                    </td>
                    <td className="num">
                      <MomentumBar score={item.score} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}
