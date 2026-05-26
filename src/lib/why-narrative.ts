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
import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { RepoProfile } from "@/lib/repo-profiles";
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
        `Released ${repo.lastReleaseTag} in the last week and added ${repo.starsDelta7d.toLocaleString("en-US")} GitHub stars — release-driven momentum.`,
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
        `Picked up ${repo.starsDelta24h.toLocaleString("en-US")} GitHub stars in the last 24 hours${score} — acute breakout in progress.`,
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
        `Trending across ${repo.channelsFiring} channels with a cross-signal score of ${repo.crossSignalScore.toFixed(1)}/6.0 — broad reach beyond GitHub.`,
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
        `Added ${repo.starsDelta7d.toLocaleString("en-US")} stars over the past week, climbing the${cat} leaderboard with a steady 7-day curve.`,
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
        `${repo.contributorsDelta30d} new contributors and ${repo.forksDelta7d.toLocaleString("en-US")} new forks in recent windows — adoption is widening, not just star-clicks.`,
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
  const stars = typeof repo.stars === "number" ? repo.stars.toLocaleString("en-US") : "—";
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

// ---------------------------------------------------------------------------
// Paragraph-form narrative (PFSummary card on /repo/[owner]/[name])
// ---------------------------------------------------------------------------
//
// The single-line `synthesizeWhy` above feeds the inline <WhyBadge>; the
// repo-detail Signal Summary card needs a 3-paragraph piece with inline
// numeric anchors and category callouts.  The component renders styled
// markup, but the prose itself stays generator-owned: paragraphs are
// emitted with three lightweight tokens that the renderer turns into
// spans:
//
//   [num]…[/num]   → <span class="num">…</span>          (mono digits)
//   [em]…[/em]     → <em>…</em>                          (accent callout)
//   [strong]…[/strong] → <strong>…</strong>              (repo name etc.)
//
// All other text is plain.  The component MUST NOT hand-write any prose;
// every sentence comes from here, derived from real Repo / community /
// profile fields.  When the input is too thin to say anything honest, we
// return `confidence: "low"` and a single short paragraph so the page
// still renders a real (not lorem) statement.

export type WhyConfidence = "low" | "medium" | "high";

export interface WhyParagraphsResult {
  paragraphs: string[]; // 1-3 paragraphs, marker-tokens inline
  confidence: WhyConfidence;
}

function fmt(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

function pct(num: number, denom: number, digits = 1): string {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0) return "—";
  return `${((num / denom) * 100).toFixed(digits)}%`;
}

const FIRING_LABELS: Array<{ key: keyof NonNullable<Repo["channelStatus"]>; label: string }> = [
  { key: "github", label: "GitHub" },
  { key: "hn", label: "Hacker News" },
  { key: "reddit", label: "Reddit" },
  { key: "twitter", label: "X" },
  { key: "bluesky", label: "Bluesky" },
  { key: "devto", label: "dev.to" },
];

function firingNames(repo: Repo): { firing: string[]; quiet: string[] } {
  const status = repo.channelStatus;
  if (!status) return { firing: [], quiet: [] };
  const firing: string[] = [];
  const quiet: string[] = [];
  for (const c of FIRING_LABELS) {
    if (status[c.key]) firing.push(c.label);
    else quiet.push(c.label);
  }
  return { firing, quiet };
}

function commaList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function categoryPhrase(repo: Repo): string {
  // Prefer language → category dressing.  No invented categories.
  if (repo.language && repo.topics.some((t) => /agent|llm|ai/i.test(t))) {
    return `AI agent / LLM tooling stack`;
  }
  if (repo.language) return `${repo.language} ${repo.categoryId ?? "developer"} space`;
  return `${repo.categoryId ?? "trending"} category`;
}

/**
 * Paragraph-form narrative driver for the Signal Summary card.
 *
 * Output is deterministic over (repo, community, profile) — same inputs
 * yield the same prose.  No randomness, no LLM.  Every clause is gated
 * by a `typeof … === "number"` (or equivalent) check so missing fields
 * silently degrade instead of printing "undefined".
 */
export function synthesizeWhyParagraphs(
  repo: Repo,
  community: RepoCommunityProfile | null,
  profile: RepoProfile | null,
): WhyParagraphsResult {
  void profile; // Reserved for future enrichment (AISO scan headline).

  const paragraphs: string[] = [];

  const rank = typeof repo.rank === "number" && repo.rank > 0 ? repo.rank : null;
  const momentum = typeof repo.momentumScore === "number" ? Math.round(repo.momentumScore) : null;
  const channelsFiring = typeof repo.channelsFiring === "number" ? repo.channelsFiring : 0;
  const { firing, quiet } = firingNames(repo);
  const mentions24h =
    repo.mentions?.detail?.totalMentions7d != null
      ? repo.mentions?.total24h ?? repo.mentionCount24h ?? 0
      : repo.mentions?.total24h ?? repo.mentionCount24h ?? 0;
  const stars = typeof repo.stars === "number" ? repo.stars : null;
  const starsD7 = typeof repo.starsDelta7d === "number" && !repo.starsDelta7dMissing ? repo.starsDelta7d : null;
  const starsD7Pct = stars && starsD7 ? pct(starsD7, stars - starsD7) : null;
  const cat = categoryPhrase(repo);

  // --- Paragraph 1: where it sits + cross-signal shape -----------------
  const p1: string[] = [];
  p1.push(`[strong]${repo.fullName}[/strong] `);

  if (rank && momentum !== null) {
    p1.push(`is sitting at [em]#${rank}[/em] on the trending leaderboard with a pulse of [num]${momentum}/100[/num]`);
  } else if (rank) {
    p1.push(`is sitting at [em]#${rank}[/em] on the trending leaderboard`);
  } else if (momentum !== null) {
    p1.push(`is carrying a momentum pulse of [num]${momentum}/100[/num]`);
  } else if (stars !== null) {
    p1.push(`carries [num]${fmt(stars)}[/num] GitHub stars on the trending board`);
  } else {
    p1.push(`is being tracked on the trending board`);
  }

  if (channelsFiring > 0 && firing.length > 0) {
    p1.push(
      ` — cross-source mentions are firing on [em]${channelsFiring} of 6[/em] channels (${commaList(firing.slice(0, 3))})`,
    );
    if (quiet.length > 0 && channelsFiring < 6) {
      p1.push(`, while ${commaList(quiet.slice(0, 3))} ${quiet.length === 1 ? "stays" : "stay"} quiet`);
    }
    p1.push(`.`);
  } else if (channelsFiring === 0) {
    p1.push(` with no cross-source channels firing yet — GitHub-stars-only signal so far.`);
  } else {
    p1.push(`.`);
  }
  paragraphs.push(p1.join(""));

  // --- Paragraph 2: weekly delta + category context --------------------
  const p2: string[] = [];
  if (starsD7 !== null && stars !== null) {
    const sign = starsD7 >= 0 ? "+" : "";
    p2.push(
      `The 7-day star delta is [num]${sign}${fmt(starsD7)}[/num]${starsD7Pct ? ` ([num]${sign}${starsD7Pct}[/num])` : ""} against a base of [num]${fmt(stars)}[/num]`,
    );
    if (Math.abs(starsD7) / Math.max(1, stars) < 0.02) {
      p2.push(`, so the headline number is category momentum more than a personal breakout`);
    } else {
      p2.push(`, a meaningful uptick on its own base`);
    }
    p2.push(`. What's actually moving is the [em]${cat}[/em]`);
    if (mentions24h > 0) {
      p2.push(` — [em]${mentions24h} ${mentions24h === 1 ? "mention" : "mentions"} in the last 24h[/em] reads like operators talking shop, not a press wave`);
    }
    p2.push(`.`);
  } else if (mentions24h > 0) {
    p2.push(
      `Cross-source chatter is the headline this window: [em]${mentions24h} ${mentions24h === 1 ? "mention" : "mentions"}[/em] in the last 24h across the [em]${cat}[/em], with no clean 7-day star reference to anchor a comparison.`,
    );
  } else if (stars !== null) {
    p2.push(
      `It sits at [num]${fmt(stars)}[/num] stars without a fresh weekly delta on record — the trending placement here is steady-state interest in the [em]${cat}[/em] rather than a 7-day breakout.`,
    );
  }
  if (p2.length > 0) paragraphs.push(p2.join(""));

  // --- Paragraph 3: watch-outs + maintainer shape ----------------------
  const p3: string[] = [];
  const watchouts: string[] = [];
  if (!repo.lastReleaseTag) watchouts.push(`no tagged release on record (treat as pre-stable)`);
  if (community && community.license == null) watchouts.push(`no license file detected (commercial users should ping the maintainers)`);
  const contributorCount = typeof repo.contributors === "number" ? repo.contributors : null;
  if (contributorCount !== null && contributorCount > 0 && contributorCount <= 8) {
    watchouts.push(`the maintainer graph is thin — [num]${contributorCount}[/num] contributors carrying it`);
  }
  if (repo.archived) watchouts.push(`the repo is flagged archived upstream`);

  if (watchouts.length > 0) {
    p3.push(`Watch-outs: ${watchouts.join(", ")}.`);
  }

  if (typeof repo.forksDelta7d === "number" && repo.forksDelta7d >= 20 && contributorCount !== null && contributorCount > 8) {
    p3.push(
      ` Adoption signal looks honest: [num]${fmt(repo.forksDelta7d)}[/num] new forks over the last week against [num]${fmt(contributorCount)}[/num] contributors — not a one-person project.`,
    );
  } else if (contributorCount !== null && contributorCount > 25) {
    p3.push(` Project carries [num]${fmt(contributorCount)}[/num] contributors, so the maintainer surface is broad.`);
  }

  if (channelsFiring >= 3) {
    p3.push(` If you're allocating attention this week, treat this as a category bet riding the broader [em]${cat}[/em] tide.`);
  } else if (channelsFiring > 0) {
    p3.push(` Read this as an early signal — narrow channel breadth means the conversation hasn't reached the wider audience yet.`);
  }
  if (p3.length > 0) paragraphs.push(p3.join(""));

  // Confidence: drop if we couldn't fill the middle paragraph.
  let confidence: WhyConfidence = "medium";
  if (paragraphs.length < 3) confidence = "low";
  if (channelsFiring >= 3 && starsD7 !== null && contributorCount !== null) confidence = "high";

  return { paragraphs, confidence };
}

/** Test-only helpers. */
export const __test = {
  whyKey,
  parseStoredWhy,
  WHY_TTL_SECONDS,
};
