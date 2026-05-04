// WhyTrendingNarrative — server-rendered prose narrative explaining why a
// repo is trending. Synthesises 2-4 unique sentences from existing
// momentum/cross-signal data with no extra DB calls.
//
// Why this exists: GSC reported 1,256 /repo/X URLs as "Discovered, not
// indexed". Google was rejecting them as thin content because the page
// was mostly client-rendered chart components. This component injects
// 50-90 unique words of server-rendered prose per repo so Googlebot has
// something to evaluate before it executes any JS.
//
// Server Component (no 'use client'). Rendered above WhyTrending in
// /repo/[owner]/[name]/page.tsx.

import type { Repo } from "@/lib/types";
import type { CanonicalRepoProfile } from "@/lib/api/repo-profile";

interface WhyTrendingNarrativeProps {
  repo: Repo;
  profile: CanonicalRepoProfile;
}

function getTopSignalSource(
  counts: Partial<Record<string, number>> | undefined,
): { platform: string; count: number } | null {
  if (!counts) return null;
  let max = 0;
  let topPlatform = "";
  for (const [platform, count] of Object.entries(counts)) {
    if (typeof count === "number" && count > max) {
      max = count;
      topPlatform = platform;
    }
  }
  return max > 0 ? { platform: topPlatform, count: max } : null;
}

export function WhyTrendingNarrative({
  repo,
  profile,
}: WhyTrendingNarrativeProps) {
  if (!repo) return null;

  const sentences: string[] = [];

  // Sentence 1: velocity — prefer 24h spike, fall back to 7d
  if (typeof repo.starsDelta24h === "number" && repo.starsDelta24h > 50) {
    const movement = repo.movementStatus ?? "rising";
    const score =
      typeof repo.momentumScore === "number"
        ? `${repo.momentumScore.toFixed(1)}/100`
        : "—";
    sentences.push(
      `${repo.fullName} gained ${repo.starsDelta24h.toLocaleString()} GitHub stars in the last 24 hours, signalling a ${movement} trend with a momentum score of ${score}.`,
    );
  } else if (
    typeof repo.starsDelta7d === "number" &&
    repo.starsDelta7d > 100
  ) {
    const cat = repo.language ?? "open-source";
    const rank = repo.categoryRank ?? "—";
    sentences.push(
      `Over the last 7 days, ${repo.fullName} added ${repo.starsDelta7d.toLocaleString()} stars and ranks #${rank} among trending ${cat} repositories.`,
    );
  }

  // Sentence 2: cross-signal strength
  if (
    typeof repo.crossSignalScore === "number" &&
    repo.crossSignalScore >= 1.0
  ) {
    const channels = repo.channelsFiring ?? 0;
    sentences.push(
      `Cross-signal score of ${repo.crossSignalScore.toFixed(1)}/5.0 with ${channels} channel${channels === 1 ? "" : "s"} firing — momentum is showing up across multiple platforms, not just one.`,
    );
  }

  // Sentence 3: top mention source
  const counts = profile?.mentions?.countsBySource as
    | Partial<Record<string, number>>
    | undefined;
  const top = getTopSignalSource(counts);
  if (top && top.count > 5) {
    sentences.push(
      `The strongest community signal is on ${top.platform} (${top.count} mentions in the last 7 days).`,
    );
  }

  // Sentence 4: contributor or fork growth
  if (
    typeof repo.forksDelta7d === "number" &&
    repo.forksDelta7d > 10 &&
    typeof repo.contributorsDelta30d === "number" &&
    repo.contributorsDelta30d > 2
  ) {
    sentences.push(
      `Beyond stars, ${repo.name} attracted ${repo.contributorsDelta30d} new contributors and ${repo.forksDelta7d} new forks recently — a sign of sustained adoption.`,
    );
  }

  if (sentences.length === 0) return null;

  return (
    <section
      className="repo-narrative"
      aria-label="Why this repo is trending"
      style={{
        padding: "1rem 1.25rem",
        margin: "0.75rem 0",
        borderLeft: "2px solid var(--v4-acc, var(--v3-acc, #ff5e1a))",
        background: "var(--v4-bg-100, var(--v3-bg-100, transparent))",
      }}
    >
      {sentences.slice(0, 4).map((s, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? "0 0 0.6rem" : "0.6rem 0",
            lineHeight: 1.55,
            fontSize: 14,
            color: "var(--v4-ink-100, var(--v3-ink-100))",
          }}
        >
          {s}
        </p>
      ))}
    </section>
  );
}

export default WhyTrendingNarrative;
