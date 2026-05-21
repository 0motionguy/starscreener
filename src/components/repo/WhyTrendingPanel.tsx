// WhyTrendingPanel — right column of the hero. Trending score (gradient
// numeral) + 4-bullet why-trending list. Synthesised from the repo's signals
// via synthesizeWhy(), then expanded into 3-4 supplementary bullets keyed
// off concrete signal facts.

import { TrendingUp } from "lucide-react";

import type { Repo } from "@/lib/types";
import { synthesizeWhy } from "@/lib/why-narrative";

interface WhyTrendingPanelProps {
  repo: Repo;
  /** Pre-fetched narrative — when present, takes precedence over inline synth. */
  preloadedText?: string | null;
}

function deriveScore(repo: Repo): number {
  // momentumScore is the canonical 0-100 from derived-repos. Float to int.
  if (typeof repo.momentumScore === "number" && repo.momentumScore > 0) {
    return Math.round(Math.min(100, Math.max(0, repo.momentumScore)));
  }
  // Fall back to socialBuzzScore.
  if (typeof repo.socialBuzzScore === "number") {
    return Math.round(Math.min(100, Math.max(0, repo.socialBuzzScore)));
  }
  return 0;
}

interface Bullet {
  title: string;
  detail: string;
}

function buildBullets(repo: Repo): Bullet[] {
  const out: Bullet[] = [];

  // 1. Recent release.
  if (repo.lastReleaseTag && repo.lastReleaseAt) {
    const days = Math.max(
      0,
      Math.round(
        (Date.now() - Date.parse(repo.lastReleaseAt)) / (24 * 60 * 60 * 1000),
      ),
    );
    out.push({
      title: `${repo.lastReleaseTag} shipped`,
      detail:
        days <= 0
          ? "released today"
          : days === 1
            ? "released 1 day ago"
            : `released ${days} days ago`,
    });
  }

  // 2. Cross-source breadth.
  if (
    typeof repo.channelsFiring === "number" &&
    repo.channelsFiring > 0
  ) {
    out.push({
      title: `Mentioned on ${repo.channelsFiring} source${repo.channelsFiring === 1 ? "" : "s"}`,
      detail:
        typeof repo.crossSignalScore === "number"
          ? `cross-signal score ${repo.crossSignalScore.toFixed(1)}/6.0`
          : "cross-source breakout in progress",
    });
  }

  // 3. 24h star spike.
  if (typeof repo.starsDelta24h === "number" && repo.starsDelta24h > 0) {
    out.push({
      title: `+${repo.starsDelta24h.toLocaleString()} stars 24h`,
      detail: `${repo.stars.toLocaleString()} total · ${repo.movementStatus ?? "trending"}`,
    });
  }

  // 4. 7d star delta as a sustained-climb proxy.
  if (
    out.length < 4 &&
    typeof repo.starsDelta7d === "number" &&
    repo.starsDelta7d > 0
  ) {
    out.push({
      title: `+${repo.starsDelta7d.toLocaleString()} stars 7d`,
      detail: "sustained climb across the past week",
    });
  }

  // Always make sure we surface at least one bullet so the panel never feels
  // empty.
  if (out.length === 0) {
    out.push({
      title: synthesizeWhy(repo).text,
      detail: `${repo.stars.toLocaleString()} stars · ${repo.movementStatus ?? "tracked"}`,
    });
  }

  return out.slice(0, 4);
}

export function WhyTrendingPanel({ repo, preloadedText }: WhyTrendingPanelProps) {
  const score = deriveScore(repo);
  const bullets = buildBullets(repo);
  return (
    <div className="hero-card why-panel">
      <div className="row between">
        <div className="why-label">Trending Score · 24h</div>
        {repo.rank ? (
          <span className="chip accent">
            <TrendingUp
              size={11}
              strokeWidth={2}
              aria-hidden="true"
              style={{ display: "inline", verticalAlign: "-1px", marginRight: 3 }}
            />
            #{repo.rank}
          </span>
        ) : null}
      </div>
      <div className="why-score">
        {score}
        <span className="max">/100</span>
      </div>
      <div className="why-label">Why trending</div>
      <div className="why-reasons">
        {preloadedText ? (
          <div className="why-reason">
            <svg
              className="why-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M2 14L6 9L9 12L14 5" />
              <circle cx="14" cy="5" r="1.5" fill="currentColor" />
            </svg>
            <div>{preloadedText}</div>
          </div>
        ) : null}
        {bullets.map((b, i) => (
          <div key={`${b.title}-${i}`} className="why-reason">
            <svg
              className="why-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M2 14L6 9L9 12L14 5" />
              <circle cx="14" cy="5" r="1.5" fill="currentColor" />
            </svg>
            <div>
              <b>{b.title}</b> — {b.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
