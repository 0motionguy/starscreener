// StarScreener Pipeline — Classification confidence helpers
//
// Small, pure helpers for interpreting and explaining classifier output.
// Kept separate from the engine so UI layers can import these without
// pulling in the rule table.

import type { ClassificationMatch } from "../types";

export type ConfidenceLabel = "high" | "medium" | "low";

/**
 * Bucket a raw confidence score (0-1) into a qualitative label.
 *   >= 0.6 → high
 *   0.3 - 0.6 → medium
 *   < 0.3 → low
 */
export function interpretConfidence(score: number): ConfidenceLabel {
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

/**
 * Produce a human-readable explanation for a classification match.
 * Example: "Matched on topic 'ai-agent' and owner 'langchain-ai' (high confidence)"
 */
export function explainClassification(match: ClassificationMatch): string {
  const label = interpretConfidence(match.confidence);
  const parts: string[] = [];

  if (match.matched.topics.length > 0) {
    const topics = match.matched.topics.map((t) => `'${t}'`).join(", ");
    const noun = match.matched.topics.length === 1 ? "topic" : "topics";
    parts.push(`${noun} ${topics}`);
  }

  if (match.matched.keywords.length > 0) {
    const keywords = match.matched.keywords.map((k) => `'${k}'`).join(", ");
    const noun = match.matched.keywords.length === 1 ? "keyword" : "keywords";
    parts.push(`${noun} ${keywords}`);
  }

  if (match.matched.ownerPrefix) {
    parts.push(`owner '${match.matched.ownerPrefix}'`);
  }

  if (parts.length === 0) {
    return `No signals matched (${label} confidence)`;
  }

  const joined =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;

  return `Matched on ${joined} (${label} confidence)`;
}
