// Shared freshness budgets for script-level health/audit checks.
// Keep these aligned with the API freshness inventory contract.

const HOUR_MS = 60 * 60 * 1000;

const BUDGET_HOURS_BY_SOURCE = {
  arxiv: 24,
  "awesome-skills": 30,
  bluesky: 6,
  "claude-rss": 30,
  devto: 24,
  "funding-news": 24,
  hackernews: 6,
  huggingface: 24,
  "huggingface-datasets": 24,
  "huggingface-spaces": 24,
  lobsters: 12,
  npm: 24,
  "openai-rss": 30,
  producthunt: 12,
  "repo-profiles": 6,
  reddit: 6,
  trending: 6,
  twitter: 12,
};

const REQUIRED_META_SOURCES = new Set([
  "arxiv",
  "bluesky",
  "devto",
  "funding-news",
  "hackernews",
  "huggingface",
  "huggingface-datasets",
  "huggingface-spaces",
  "lobsters",
  "npm",
  "producthunt",
  "repo-profiles",
  "reddit",
  "trending",
]);

export const REQUIRED_META_SOURCE_LIST = [...REQUIRED_META_SOURCES].sort();

export const DEFAULT_FALLBACK_BUDGET_MS = 24 * HOUR_MS;

export function budgetMsForSource(source) {
  const hours = BUDGET_HOURS_BY_SOURCE[source];
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return hours * HOUR_MS;
  }
  return DEFAULT_FALLBACK_BUDGET_MS;
}

export function budgetHoursForSource(source, fallbackHours = 24) {
  const hours = BUDGET_HOURS_BY_SOURCE[source];
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return hours;
  }
  return fallbackHours;
}

export function isRequiredMetaSource(source) {
  return REQUIRED_META_SOURCES.has(source);
}
