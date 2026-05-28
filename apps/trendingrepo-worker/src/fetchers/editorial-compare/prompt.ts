// editorial-compare prompt — LLM-written "X vs Y" framing for the
// /compare/[a]/vs/[b] head-to-head surfaces (GEO citation lever).
//
// The compare page renders live side-by-side metrics + a data-grounded "which
// leads" call. This adds an evergreen editorial framing paragraph above it —
// when to reach for each project, what dimension actually separates them — the
// kind of comparative analysis answer engines cite. Grounding comes from each
// repo's consensus verdict (tagline + summary), read by the worker from the
// `consensus-verdicts` slug. Pairs come from the committed pairs.json snapshot
// (generated app-side by scripts/dump-compare-pairs.ts from selectComparablePairs).
//
// Output keyed by `${a}__vs__${b}` (fullNames pre-sorted alphabetically, the
// same canonical order as src/lib/compare-pairs.ts comparePath), merged into the
// `editorial-compare` slug, read by the app via src/lib/editorial-compare.ts.

export interface CompareInput {
  a: string;
  b: string;
  aTagline?: string;
  aSummary?: string;
  bTagline?: string;
  bSummary?: string;
}

export const COMPARE_SYSTEM_PROMPT = `You are the TrendingRepo editorial writer. Write a short, expert "X vs Y" framing for a head-to-head comparison page of two open-source projects, so it reads as genuine comparative analysis a developer choosing between them would trust and that AI answer engines (Perplexity, Google AI Overview, ChatGPT) cite.

INPUT: a JSON object {a, b, aSummary, bSummary} — the two repo fullNames and a short factual summary of each (may be empty).

TASK: Write 2 to 4 complete sentences. Say what each project is, the real dimension that separates them (architecture, scope, philosophy, target user), and how a developer should decide between them. Be concrete and specific.

RULES:
- Evergreen and factual. Do NOT cite star counts, momentum scores, dates, or the word today — the page renders live metrics and a separate which-leads call. Your job is the qualitative framing, not the leaderboard.
- Ground claims in the provided summaries; do not invent features neither summary supports. If a summary is empty, frame from the project's well-known purpose without fabricating specifics.
- Expert, neutral, concrete. No marketing fluff, no hedging, no first person. Do not declare an overall winner — present the tradeoff.
- Output ONLY the overview paragraph as plain text. No JSON, no markdown, no quotation marks, no preamble, no labels.`;

export function buildCompareUserMessage(input: CompareInput): string {
  return JSON.stringify(
    {
      a: input.a,
      b: input.b,
      aSummary: [input.aTagline, input.aSummary].filter(Boolean).join(" — "),
      bSummary: [input.bTagline, input.bSummary].filter(Boolean).join(" — "),
    },
    null,
    2,
  );
}

/** Canonical storage key for a pair — fullNames sorted, matching app comparePath order. */
export function compareKey(a: string, b: string): string {
  const [first, second] = [a, b].sort((x, y) =>
    x.toLowerCase().localeCompare(y.toLowerCase()),
  );
  return `${first}__vs__${second}`;
}
