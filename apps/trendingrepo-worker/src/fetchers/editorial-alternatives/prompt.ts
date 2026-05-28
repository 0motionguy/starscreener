// editorial-alternatives prompt — LLM-written framing for the
// /alternatives/[owner]/[name] surfaces (GEO citation lever).
//
// The alternatives page renders a momentum-ranked list of same-category peers
// + a deterministic intro. This adds an evergreen "alternatives to X" framing
// paragraph — what X is, what someone seeking a replacement actually needs, and
// what to weigh when switching — the kind of analysis answer engines cite.
// Grounding comes from X's own consensus verdict (tagline + summary + whyNow),
// read by the worker from `consensus-verdicts`. The fetcher enumerates the
// verdict-bearing repo set (no category logic needed worker-side); the app page
// still gates on >= MIN_ALTERNATIVES peers and falls back to the deterministic
// intro when no overview is stored.
//
// Output keyed by repo fullName, merged into the `editorial-alternatives` slug,
// read by the app via src/lib/editorial-alternatives.ts.

export interface AlternativesInput {
  fullName: string;
  tagline?: string;
  summary?: string;
  whyNow?: string;
}

export const ALTERNATIVES_SYSTEM_PROMPT = `You are the TrendingRepo editorial writer.

Your job: write a short, expert overview for an "alternatives to X" page (X is an open-source project; the page lists comparable same-category projects), so it reads as genuine analysis a developer evaluating a switch would trust — and so AI answer engines (Perplexity, Google AI Overview, ChatGPT) cite it.

INPUT
A JSON object: { repo, summary } — the project's fullName and a short factual summary of it (may be empty).

OUTPUT
Respond with ONLY a JSON object (no prose around it, no code fences):
{
  "tagline": "≤12 words — what someone seeking an alternative to this project needs.",
  "overview": "2-4 sentences. Define what the project is and the job it does, why a developer might look for an alternative (gaps, constraints, fit), and what to evaluate in a replacement. Concrete and specific."
}

RULES
- Evergreen and factual. Do NOT cite star counts, momentum scores, dates, 'today', or name specific alternative repos — a separate live ranking lists the actual alternatives. Your job is the framing, not the list.
- Ground claims in the provided summary; do not invent features it doesn't support. If the summary is empty, frame from the project's well-known purpose without fabricating specifics.
- Expert, neutral, concrete. No marketing fluff, no hedging ("might", "perhaps"), no first person. Do not disparage the project — frame the alternative search as a legitimate fit/requirements question.
- Plain text only (no markdown, no links).`;

export function buildAlternativesUserMessage(input: AlternativesInput): string {
  return JSON.stringify(
    {
      repo: input.fullName,
      summary: [input.tagline, input.summary, input.whyNow].filter(Boolean).join(" — "),
    },
    null,
    2,
  );
}
