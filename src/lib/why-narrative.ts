// Why-narrative engine — synthesises a 1-2 sentence "why it's trending"
// caption per repo from existing momentum + cross-signal fields. No LLM,
// no extra IO.
//
// Two surfaces consume this:
//   - The <WhyBadge> server component (rendered on /top10 + /repo/* pages)
//     — calls `getWhyNarrative()` to read from data-store with a synth
//     fallback so a cold cache still renders.
//   - The build-why-narratives.mjs script — calls `synthesizeWhy()` per
//     top-50 trending repo and persists each via `setWhyNarrative()` with
//     a 24h TTL so warm reads don't re-derive.
//
// Storage key shape: `repo:<owner>:<name>:why` (matches AGN-791 spec).
// Pure synthesis is deterministic over a Repo row, so the engine is safe
// to call inline if the cache misses — the persisted copy is a perf
// optimisation, not the source of truth.

import { getDataStore } from "@/lib/data-store";
import type { Repo } from "@/lib/types";

const WHY_TTL_SECONDS = 60 * 60 * 24; // 24h per spec
const MAX_LEN = 220;

export interface WhyNarrative {
  /** 1-2 sentence caption. Plain text, no markup. */
  text: string;
  /** Dominant signal keyword: drives the badge's accent treatment. */
  signal:
    | "stars-velocity"
    | "cross-signal"
    | "weekly-momentum"
    | "release"
    | "contributor-surge"
    | "social-buzz"
    | "organic";
  /** ISO timestamp at synthesis. */
  generatedAt: string;
}

function whyKey(owner: string, name: string): string {
  return `repo:${owner}:${name}:why`;
}

function isWithin(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function clamp(s: string): string {
  if (s.length <= MAX_LEN) return s;
  return s.slice(0, MAX_LEN - 1).trimEnd() + "…";
}

/**
 * Pick the dominant 24-48h signal from the repo row and turn it into
 * a 1-2 sentence caption. Order of preference matches what a reader
 * actually wants to know about a trending repo:
 *
 *   1. Major release in the last 7d (concrete event)
 *   2. 24h star spike with high momentum (acute trend)
 *   3. Cross-signal breadth (channelsFiring >= 3 — broad reach)
 *   4. 7d star delta with momentum (sustained climb)
 *   5. Contributor surge (sign of adoption)
 *   6. Social mention burst (24h)
 *   7. Organic / fallback line so every repo gets *something*
 */
export function synthesizeWhy(repo: Repo): WhyNarrative {
  const generatedAt = new Date().toISOString();

  // 1. Recent release — concrete event beats velocity signals.
  if (
    isWithin(repo.lastReleaseAt, 7) &&
    repo.lastReleaseTag &&
    typeof repo.starsDelta7d === "number" &&
    repo.starsDelta7d > 50
  ) {
    return {
      text: clamp(
        `Released ${repo.lastReleaseTag} in the last week and added ${repo.starsDelta7d.toLocaleString()} GitHub stars — release-driven momentum.`,
      ),
      signal: "release",
      generatedAt,
    };
  }

  // 2. 24h star spike.
  if (
    typeof repo.starsDelta24h === "number" &&
    repo.starsDelta24h >= 100 &&
    !repo.starsDelta24hMissing
  ) {
    const score =
      typeof repo.momentumScore === "number"
        ? ` (momentum ${repo.momentumScore.toFixed(0)}/100)`
        : "";
    return {
      text: clamp(
        `Picked up ${repo.starsDelta24h.toLocaleString()} GitHub stars in the last 24 hours${score} — acute breakout in progress.`,
      ),
      signal: "stars-velocity",
      generatedAt,
    };
  }

  // 3. Cross-signal breadth.
  if (
    typeof repo.crossSignalScore === "number" &&
    repo.crossSignalScore >= 1.5 &&
    typeof repo.channelsFiring === "number" &&
    repo.channelsFiring >= 3
  ) {
    return {
      text: clamp(
        `Trending across ${repo.channelsFiring} channels with a cross-signal score of ${repo.crossSignalScore.toFixed(1)}/5.0 — broad reach beyond GitHub.`,
      ),
      signal: "cross-signal",
      generatedAt,
    };
  }

  // 4. Sustained 7d climb.
  if (
    typeof repo.starsDelta7d === "number" &&
    repo.starsDelta7d >= 200 &&
    !repo.starsDelta7dMissing
  ) {
    const cat = repo.language ? ` ${repo.language}` : "";
    return {
      text: clamp(
        `Added ${repo.starsDelta7d.toLocaleString()} stars over the past week, climbing the${cat} leaderboard with a steady 7-day curve.`,
      ),
      signal: "weekly-momentum",
      generatedAt,
    };
  }

  // 5. Contributor + fork growth.
  if (
    typeof repo.contributorsDelta30d === "number" &&
    repo.contributorsDelta30d >= 5 &&
    typeof repo.forksDelta7d === "number" &&
    repo.forksDelta7d >= 20
  ) {
    return {
      text: clamp(
        `${repo.contributorsDelta30d} new contributors and ${repo.forksDelta7d.toLocaleString()} new forks in recent windows — adoption is widening, not just star-clicks.`,
      ),
      signal: "contributor-surge",
      generatedAt,
    };
  }

  // 6. 24h mention burst.
  if (typeof repo.mentionCount24h === "number" && repo.mentionCount24h >= 10) {
    return {
      text: clamp(
        `Mentioned ${repo.mentionCount24h} times in the last 24 hours across tracked communities — social buzz outpacing GitHub stars.`,
      ),
      signal: "social-buzz",
      generatedAt,
    };
  }

  // 7. Organic fallback. Always has something to say.
  const stars = typeof repo.stars === "number" ? repo.stars.toLocaleString() : "—";
  const cat = repo.language ? ` ${repo.language}` : "";
  return {
    text: clamp(
      `${repo.fullName} sits at ${stars} GitHub stars with steady${cat} traction — organic growth keeps it on the trending list.`,
    ),
    signal: "organic",
    generatedAt,
  };
}

/**
 * Read the persisted why-narrative for a repo. Falls back to live
 * synthesis when the cache is empty (cold Lambda) or the persisted
 * shape is unrecognisable. Never throws.
 */
export async function getWhyNarrative(
  owner: string,
  name: string,
  repo?: Repo | null,
): Promise<WhyNarrative | null> {
  try {
    const store = getDataStore();
    const result = await store.read<unknown>(whyKey(owner, name));
    const parsed = parseStoredWhy(result.data);
    if (parsed) return parsed;
  } catch {
    // Fall through to synth — data-store outages must not blank the badge.
  }

  if (repo) return synthesizeWhy(repo);
  return null;
}

/**
 * Persist the why-narrative for a repo with the canonical 24h TTL.
 * Used by the build-why-narratives script. Best-effort: collector
 * scripts handle write errors at the call-site level.
 */
export async function setWhyNarrative(
  owner: string,
  name: string,
  narrative: WhyNarrative,
): Promise<void> {
  const store = getDataStore();
  await store.write<WhyNarrative>(whyKey(owner, name), narrative, {
    ttlSeconds: WHY_TTL_SECONDS,
  });
}

function parseStoredWhy(raw: unknown): WhyNarrative | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text : null;
  const signal = typeof obj.signal === "string" ? obj.signal : null;
  const generatedAt =
    typeof obj.generatedAt === "string" ? obj.generatedAt : null;
  if (!text || !signal || !generatedAt) return null;
  // Allowed signal whitelist — any unknown value falls back to "organic"
  // so a future writer drift doesn't crash the renderer.
  const allowed: WhyNarrative["signal"][] = [
    "stars-velocity",
    "cross-signal",
    "weekly-momentum",
    "release",
    "contributor-surge",
    "social-buzz",
    "organic",
  ];
  const safeSignal = (allowed as string[]).includes(signal)
    ? (signal as WhyNarrative["signal"])
    : "organic";
  return { text, signal: safeSignal, generatedAt };
}

/** Test-only helpers. */
export const __test = {
  whyKey,
  parseStoredWhy,
  WHY_TTL_SECONDS,
};
