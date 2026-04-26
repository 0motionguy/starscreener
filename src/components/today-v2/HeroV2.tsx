// V2 Hero — Node/01 × Linear fusion. Server component.
//
// Layout (desktop):
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ // 01 · TRENDINGREPO · 04.26                  ┌─ SYSTEM    ──┐  │
//   │                                               │ SCOPE        │  │
//   │   Today's fastest-moving                       │ SURFACE      │  │
//   │   repos, the ideas forming                     │ SERIAL       │  │
//   │   around them, and the signals.               └──────────────┘  │
//   │                                                                  │
//   │   220 repos · 12 breakouts · top: foo/bar +1,432 · 8m ago        │
//   │                                                                  │
//   │   [ DROP A REPO → ]  [ EXPLORE TERMINAL → ]   ┌── spider ───┐   │
//   │                                                │   *        │   │
//   │                                                │  ▓▓        │   │
//   │                                                └────────────┘   │
//   │                                                                  │
//   │   ┌─14ms─┐  ┌─99.98%─┐  ┌─220─┐  ┌─+18,342─┐                    │
//   │   │ AVG   │  │ DETECT │  │ LIVE │  │ STARS  │                    │
//   │   └───────┘  └────────┘  └──────┘  └────────┘                    │
//   └──────────────────────────────────────────────────────────────────┘
//
// On mobile (<768px), the spider hides, the headline drops to clamp(40px,9vw,72px),
// and the meta sidecard collapses underneath the headline.

import Link from "next/link";

import type { Repo } from "@/lib/types";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";
import { SpiderNode } from "@/components/today-v2/primitives/SpiderNode";

interface HeroV2Props {
  repos: Repo[];
  /** ISO timestamp of last scrape — drives the freshness label. */
  lastFetchedAt: string | null;
}

const HERO_HEADLINE_PARTS = [
  "Today's fastest-moving",
  "repos,", // dim word #1
  "the ideas forming",
  "around them,", // dim word #2
  "and the",
  "signals", // dim word #3
  "proving demand.",
];

// Indices that get the muted ink color — Node/01's "structural words dim,
// content words bright" pattern.
const DIM_INDICES = new Set([1, 3, 5]);

export function HeroV2({ repos, lastFetchedAt }: HeroV2Props) {
  const total = repos.length;
  const breakouts = repos.filter(
    (r) => r.movementStatus === "breakout" || r.movementStatus === "hot",
  ).length;
  const topMover = [...repos]
    .filter((r) => r.starsDelta24h > 0)
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)[0];

  // Total 24h stars across the corpus — the "throughput" stat.
  const totalStarsDelta = repos.reduce(
    (sum, r) => sum + Math.max(0, r.starsDelta24h ?? 0),
    0,
  );

  const freshness = lastFetchedAt ? getRelativeTime(lastFetchedAt) : "—";

  // Date string for the eyebrow — formatted as DD.MM in operator voice.
  const today = new Date(lastFetchedAt ?? Date.now());
  const dateLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  // Pull peripheral spider labels from the top movers — gives the network
  // graph real meaning instead of decorative noise.
  const peripheralLabels = [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 4)
    .map((r) => r.name.toUpperCase().slice(0, 12));

  const centerLabel = topMover ? topMover.name.toUpperCase().slice(0, 14) : "TRENDINGREPO";

  return (
    <section className="relative pt-16 pb-12 sm:pt-20 sm:pb-16 border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-6">
          <span className="v2-live-dot" aria-hidden />
          <span className="v2-mono">
            <span aria-hidden>{"// "}</span>
            01 · TRENDINGREPO · {dateLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 items-start">
          {/* LEFT — headline + meta strip + CTAs */}
          <div className="min-w-0">
            <h1
              className="v2-display"
              style={{ fontSize: "clamp(40px, 8vw, 96px)" }}
            >
              {HERO_HEADLINE_PARTS.map((part, i) => (
                <span key={i}>
                  <span
                    style={{
                      color: DIM_INDICES.has(i)
                        ? "var(--v2-ink-400)"
                        : "var(--v2-ink-000)",
                    }}
                  >
                    {part}
                  </span>{" "}
                </span>
              ))}
            </h1>

            {/* Live momentum strip — refactored from MomentumHeadline,
                inlined here for V2 typography. */}
            <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 v2-mono">
              <span>
                <span className="text-[color:var(--v2-ink-100)] tabular-nums">
                  {total.toLocaleString("en-US")}
                </span>{" "}
                repos tracked
              </span>
              <span aria-hidden className="text-[color:var(--v2-line-300)]">
                ·
              </span>
              <span className="text-[color:var(--v2-acc)]">
                <span className="tabular-nums">{breakouts}</span>{" "}
                <span className="text-[color:var(--v2-ink-300)]">breakouts</span>
              </span>
              {topMover ? (
                <>
                  <span aria-hidden className="text-[color:var(--v2-line-300)]">
                    ·
                  </span>
                  <span>
                    <span className="text-[color:var(--v2-ink-300)]">top:</span>{" "}
                    <Link
                      href={`/repo/${topMover.owner}/${topMover.name}`}
                      className="text-[color:var(--v2-ink-100)] tracking-normal normal-case hover:text-[color:var(--v2-acc)] transition-colors"
                    >
                      {topMover.fullName}
                    </Link>{" "}
                    <span className="text-[color:var(--v2-sig-green)] tabular-nums">
                      +{topMover.starsDelta24h.toLocaleString("en-US")}
                    </span>
                    <span className="text-[color:var(--v2-ink-400)]"> /24h</span>
                  </span>
                </>
              ) : null}
              <span aria-hidden className="text-[color:var(--v2-line-300)]">
                ·
              </span>
              <span className="text-[color:var(--v2-ink-300)]">
                data{" "}
                <span className="text-[color:var(--v2-ink-100)]">
                  {freshness}
                </span>
              </span>
            </div>

            {/* Subtitle — Node/01 mono uppercase. */}
            <p className="mt-7 v2-mono max-w-[48ch]" style={{ lineHeight: 1.7 }}>
              <span aria-hidden>{"// "}</span>
              5-stage product loop · discover · validate · build · launch · track. The
              page narrates itself like a shell.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/submit" className="v2-btn v2-btn-primary">
                Drop a repo <span aria-hidden>→</span>
              </Link>
              <Link href="/top" className="v2-btn v2-btn-ghost">
                Explore terminal <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          {/* RIGHT — spec block + spider node graph */}
          <div className="flex flex-col gap-6">
            {/* Spec block — Node/01 hero meta */}
            <div className="v2-card p-5">
              <div className="grid grid-cols-[80px_1fr] gap-y-3 gap-x-4 v2-mono">
                <span className="text-[color:var(--v2-ink-400)]">SYSTEM</span>
                <span className="text-[color:var(--v2-ink-100)]">TRENDINGREPO</span>
                <span className="text-[color:var(--v2-ink-400)]">SCOPE</span>
                <span className="text-[color:var(--v2-ink-100)]">
                  WEB · CLI · MCP
                </span>
                <span className="text-[color:var(--v2-ink-400)]">SURFACE</span>
                <span className="text-[color:var(--v2-ink-100)]">
                  DARK · TECHNICAL
                </span>
                <span className="text-[color:var(--v2-ink-400)]">SERIAL</span>
                <span className="text-[color:var(--v2-ink-100)] tabular-nums">
                  {String(total).padStart(3, "0")}/2200
                </span>
              </div>
            </div>

            {/* Spider node — wrapped in terminal bar chrome */}
            <div className="v2-card overflow-hidden hidden md:block">
              <TerminalBar
                label="// NODE · SPIDER"
                status={
                  <>
                    <span className="tabular-nums">
                      {peripheralLabels.length}
                    </span>{" "}
                    NODES · LIVE
                  </>
                }
              />
              <div className="p-4 bg-[color:var(--v2-bg-000)]">
                <SpiderNode
                  centerLabel={centerLabel}
                  peripheralLabels={peripheralLabels}
                  className="max-w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stat tiles — bracket-marked on the most prominent (breakouts) */}
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="v2-stat">
            <div className="v tabular-nums">
              {formatNumber(total)}
            </div>
            <div className="k">REPOS LIVE</div>
          </div>

          {/* Bracket-marked breakout stat — the focused object */}
          <div className="v2-stat v2-bracket relative">
            <BracketMarkers />
            <div className="v tabular-nums text-[color:var(--v2-acc)]">
              {formatNumber(breakouts)}
            </div>
            <div className="k">BREAKOUTS · 24H</div>
          </div>

          <div className="v2-stat">
            <div className="v tabular-nums">
              +{formatNumber(totalStarsDelta)}
            </div>
            <div className="k">STARS · 24H</div>
          </div>

          <div className="v2-stat">
            <div className="v tabular-nums">
              {freshness}
            </div>
            <div className="k">DATA FRESHNESS</div>
          </div>
        </div>
      </div>
    </section>
  );
}
