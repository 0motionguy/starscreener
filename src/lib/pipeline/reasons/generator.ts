// StarScreener Pipeline — reason generator
//
// Takes a ReasonInput, runs every detector, and produces the final
// RepoReason with:
//   - up to 5 top ReasonDetail entries, priority-sorted
//   - a concatenated short summary sentence (<= 160 chars)
//   - a fallback `organic_growth` reason when nothing fires but the repo is
//     still trending up
//
// Detectors are side-effect free, so we just call them all. The file is
// intentionally dumb — no I/O, no persistence — so tests run fast and the
// query layer can compute reasons on demand.

import type { ReasonCode, ReasonDetail, RepoReason } from "../types";
import { REASON_METADATA } from "./codes";
import {
  ALL_DETECTORS,
  buildOrganicGrowthReason,
  type ReasonInput,
} from "./detectors";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAX_DETAILS = 5;
const MAX_SUMMARY_LEN = 160;
const SUMMARY_MAX_HEADLINES = 3;
const SUMMARY_CONNECTORS = ["and", "plus", "also"] as const;

// ---------------------------------------------------------------------------
// Summary construction
// ---------------------------------------------------------------------------

function lowercaseFirst(s: string): string {
  if (s.length === 0) return s;
  // Preserve acronyms like "HN" / "API" — only lowercase if second char isn't
  // also uppercase (heuristic for all-caps prefixes).
  if (s.length >= 2 && s[0] === s[0].toUpperCase() && s[1] === s[1].toUpperCase()) {
    return s;
  }
  return s[0].toLowerCase() + s.slice(1);
}

function stripTrailingPunct(s: string): string {
  return s.replace(/[.!?]+$/u, "");
}

/**
 * Combine 1-3 headlines into a single natural-language summary.
 * Keeps output under MAX_SUMMARY_LEN characters.
 */
function buildSummary(details: ReasonDetail[]): string {
  if (details.length === 0) return "No notable signals detected.";

  const headlines = details.slice(0, SUMMARY_MAX_HEADLINES).map((d) => stripTrailingPunct(d.headline));

  if (headlines.length === 1) {
    return clampSentence(headlines[0] + ".");
  }

  // Start with strongest headline, append remaining with connectors.
  let out = headlines[0];
  for (let i = 1; i < headlines.length; i++) {
    const connector = SUMMARY_CONNECTORS[i - 1] ?? "and";
    const next = lowercaseFirst(headlines[i]);
    const candidate = `${out} ${connector} ${next}`;
    if (candidate.length + 1 > MAX_SUMMARY_LEN) break;
    out = candidate;
  }

  return clampSentence(out + ".");
}

function clampSentence(s: string): string {
  if (s.length <= MAX_SUMMARY_LEN) return s;
  // Cut to last space before the limit, then add an ellipsis + period.
  const slice = s.slice(0, MAX_SUMMARY_LEN - 2);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > MAX_SUMMARY_LEN - 40 ? slice.slice(0, lastSpace) : slice;
  return stripTrailingPunct(cut) + "...";
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

function byPriorityDesc(a: ReasonDetail, b: ReasonDetail): number {
  const pa = REASON_METADATA[a.code]?.priority ?? 0;
  const pb = REASON_METADATA[b.code]?.priority ?? 0;
  if (pb !== pa) return pb - pa;
  // Stable-ish tiebreak: alphabetical on code.
  return a.code.localeCompare(b.code);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateReasons(input: ReasonInput, now: number = Date.now()): RepoReason {
  // Run every detector. Each is pure so there's nothing to await.
  const raw: (ReasonDetail | null)[] = ALL_DETECTORS.map((detect) => detect(input, now));
  const fired: ReasonDetail[] = raw.filter((r): r is ReasonDetail => r !== null);

  // Sort by priority desc, take top MAX_DETAILS.
  fired.sort(byPriorityDesc);
  let details = fired.slice(0, MAX_DETAILS);

  // Organic-growth fallback.
  if (details.length === 0 && !input.isQuietKiller && input.repo.starsDelta7d > 0) {
    details = [buildOrganicGrowthReason(input)];
  } else if (details.length === 0) {
    // No signals and no positive weekly delta — emit an empty-but-honest reason.
    details = [
      {
        code: "organic_growth",
        headline: "No notable signals this cycle",
        detail: `${input.repo.name} did not trigger any momentum signals in this compute cycle.`,
        confidence: "low",
        timeframe: "recent",
        evidence: [
          { label: "Stars gained (7d)", value: input.repo.starsDelta7d },
        ],
      },
    ];
  }

  const codes: ReasonCode[] = details.map((d) => d.code);
  const summary = buildSummary(details);

  return {
    repoId: input.repo.id,
    generatedAt: new Date(now).toISOString(),
    codes,
    summary,
    details,
  };
}

export function generateReasonsBatch(inputs: ReasonInput[], now: number = Date.now()): RepoReason[] {
  return inputs.map((input) => generateReasons(input, now));
}
