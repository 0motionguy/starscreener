// RepoPulsePanel — the right column of the repo-detail hero. Renders the
// `Profile - standalone.html` `PFPulseCard` DOM tree 1:1 against real repo
// data (no PF_DATA, no synthesized fields). The card holds:
//   1. head row     — "// PULSE · 24H" + live "1H" pill
//   2. score row    — grade letter + numeric score + flags (rank / 7d / firing)
//   3. constellation— six source bubbles (G/Y/R/X/B/D), firing ones get the
//                     source-color border + glow via `--src-*` CSS vars
//   4. key dates    — created / last release / last commit / last mention
//
// The constellation and key-dates strips are inline here. Agent 10 no longer
// mounts `<RepoConstellation/>` or a standalone "key dates" component on the
// page; this card is the single source of those two surfaces.
//
// Empty-state policy (real-data-only):
//   - rank: "—" when `repo.rank` is null / 0
//   - d7Pct: hide the chip entirely when we can't compute it honestly
//   - firing: hide the chip when `channelsFiring` is missing
//   - createdAt / lastCommitAt / lastReleaseAt / latest mention: "—" via
//     ageLabel when iso is null or unparseable
//
// Server component — pure, no `'use client'` directive.

import { ageLabel } from "@/lib/format-age";
import { gradeFromComposite } from "@/lib/scoring/grade";

import type {
  CrossSourceMentionDetail,
  Repo,
  SocialPlatform,
} from "@/lib/types";
import type { NormalizedGithubEvent } from "@/lib/github-events";

interface RepoPulsePanelProps {
  repo: Repo;
  events: NormalizedGithubEvent[];
  // `fetchedAt` is kept in the signature so the page can pass it without
  // breaking; the PF card uses a fixed "1H" live pill (the freshness chrome
  // for the page lives in the header now).
  fetchedAt?: string | null;
}

interface ConstellationChannel {
  // Single-letter glyph rendered inside the bubble (G/Y/R/X/B/D).
  code: string;
  // SocialPlatform key on `repo.mentions.perSource` for fetching counts.
  platform: SocialPlatform;
  // CSS variable name driving border + glow when firing. Aligned with
  // `public/shell.css` (`--src-dev` for dev.to, `--src-x` for twitter).
  cssVar:
    | "--src-github"
    | "--src-hackernews"
    | "--src-reddit"
    | "--src-x"
    | "--src-bluesky"
    | "--src-dev";
  // Lowercase source label rendered in the bubble tooltip.
  src: string;
}

// Six PF channels, in standalone order.
const CHANNELS: ConstellationChannel[] = [
  { code: "G", platform: "github",     cssVar: "--src-github",     src: "github"     },
  { code: "Y", platform: "hackernews", cssVar: "--src-hackernews", src: "hackernews" },
  { code: "R", platform: "reddit",     cssVar: "--src-reddit",     src: "reddit"     },
  { code: "X", platform: "twitter",    cssVar: "--src-x",          src: "x"          },
  { code: "B", platform: "bluesky",    cssVar: "--src-bluesky",    src: "bluesky"    },
  { code: "D", platform: "devto",      cssVar: "--src-dev",        src: "dev"        },
];

/** Latest cross-source mention across all detail buckets, by observedAt. */
function latestMentionIso(repo: Repo): string | null {
  const detail = repo.mentions?.detail?.perSource;
  if (!detail) return null;
  let bestIso: string | null = null;
  let bestTs = -Infinity;
  for (const bucket of Object.values(detail)) {
    if (!bucket?.top?.length) continue;
    for (const mention of bucket.top as CrossSourceMentionDetail[]) {
      const ts = Date.parse(mention.observedAt);
      if (!Number.isFinite(ts)) continue;
      if (ts > bestTs) {
        bestTs = ts;
        bestIso = mention.observedAt;
      }
    }
  }
  return bestIso;
}

/** Render a percentage with sign + one decimal (e.g. "+0.9%", "-2.4%"). */
function formatPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

export function RepoPulsePanel({ repo, events }: RepoPulsePanelProps) {
  const nowMs = Date.now();

  // ---- score + grade -----------------------------------------------------
  // momentumScore is the canonical 0-100 composite already on every Repo
  // row; we round to integer for display (PF mock shows "21" not "21.4").
  const score = Math.max(0, Math.min(100, Math.round(repo.momentumScore ?? 0)));
  const grade = gradeFromComposite(score);

  // ---- rank flag ---------------------------------------------------------
  const rankLabel = repo.rank && repo.rank > 0 ? `#${repo.rank}` : "—";

  // ---- 7d delta chip -----------------------------------------------------
  // Honest derivation: 7d-star delta / (current stars - 7d-star delta).
  // Hide the chip entirely if we can't compute a real number.
  let d7Pct: string | null = null;
  if (
    typeof repo.starsDelta7d === "number" &&
    typeof repo.stars === "number" &&
    repo.stars > 0 &&
    !repo.starsDelta7dMissing
  ) {
    const base = repo.stars - repo.starsDelta7d;
    if (base > 0) {
      const pct = (repo.starsDelta7d / base) * 100;
      if (Math.abs(pct) >= 0.05) d7Pct = formatPct(pct);
    }
  }

  // ---- firing chip -------------------------------------------------------
  const firingCount =
    typeof repo.channelsFiring === "number" && repo.channelsFiring >= 0
      ? repo.channelsFiring
      : null;
  const firingLabel = firingCount !== null ? `${firingCount}/6` : null;

  // ---- constellation -----------------------------------------------------
  const bubbles = CHANNELS.map((c) => {
    const bucket = repo.mentions?.perSource?.[c.platform];
    const n24 = bucket?.count24h ?? 0;
    return {
      ...c,
      n: n24,
      firing: n24 > 0,
    };
  });

  // ---- key dates ---------------------------------------------------------
  // Last commit: prefer the freshest PushEvent (events are sorted desc by
  // the GitHub events adapter); fall back to repo.lastCommitAt.
  const latestPushIso =
    events.find((e) => e.type === "PushEvent")?.createdAt ?? null;
  const lastCommitIso = latestPushIso ?? repo.lastCommitAt ?? null;
  const lastReleaseIso = repo.lastReleaseAt ?? null;
  const lastMentionIso = latestMentionIso(repo);
  const createdIso = repo.createdAt ?? null;

  return (
    <aside className="pf-pulse">
      <div className="pf-pulse-head">
        <span>
          <span style={{ color: "var(--accent)" }}>{"//"}</span> PULSE · 24H
        </span>
        <span className="live">
          <span className="live-dot" style={{ width: 5, height: 5 }} /> 1H
        </span>
      </div>

      <div className="pf-pulse-score">
        <div className="pf-pulse-grade">{grade}</div>
        <div className="pf-pulse-main">
          <div className="pf-pulse-num">
            {score}
            <span className="denom">/100</span>
          </div>
          <div className="pf-pulse-flags">
            <span className="pf-flag rank">↗ {rankLabel}</span>
            {d7Pct ? (
              <span className="pf-flag up">▲ {d7Pct} 7d</span>
            ) : null}
            {firingLabel ? (
              <span className="pf-flag firing">◉ {firingLabel} firing</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pf-pulse-sec pf-const-row">
        <div className="pf-pulse-sec-l">Signal constellation</div>
        <div className="pf-constellation">
          {bubbles.map((b) => (
            <div
              key={b.code}
              className={"pf-const-bub " + (b.firing ? "firing" : "silent")}
              data-n={b.n}
              style={
                b.firing
                  ? {
                      color: `var(${b.cssVar})`,
                      borderColor: `var(${b.cssVar})`,
                      background: "rgba(255,255,255,0.02)",
                      boxShadow:
                        `0 0 0 1px color-mix(in oklab, var(${b.cssVar}) 27%, transparent), ` +
                        `inset 0 0 12px color-mix(in oklab, var(${b.cssVar}) 12%, transparent)`,
                    }
                  : undefined
              }
              title={`${b.src} · ${b.n}`}
              tabIndex={0}
            >
              {b.code}
            </div>
          ))}
        </div>
      </div>

      <div className="pf-pulse-sec">
        <div className="pf-pulse-sec-l">Key dates</div>
        <div className="pf-dates">
          <span className="k">CREATED</span>
          <span className="v">{ageLabel(createdIso, nowMs)}</span>
          <span className="k">LAST REL</span>
          <span className={"v" + (lastReleaseIso ? "" : " dim")}>
            {ageLabel(lastReleaseIso, nowMs)}
          </span>
          <span className="k">LAST COMMIT</span>
          <span className="v">{ageLabel(lastCommitIso, nowMs)}</span>
          <span className="k">LAST MENTION</span>
          <span className={"v" + (lastMentionIso ? "" : " dim")}>
            {ageLabel(lastMentionIso, nowMs)}
          </span>
        </div>
      </div>
    </aside>
  );
}
