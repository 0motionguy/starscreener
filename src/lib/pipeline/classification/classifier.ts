// StarScreener Pipeline — Classifier Engine
//
// Pure, deterministic rule-based classifier. Scores each rule against a
// Repo's topics, description, name, and owner; picks the top rule as
// primary and up to 2 runners-up as secondary. Designed to be upgradable
// later (e.g., ML re-ranker on top of this deterministic first pass).
//
// Scoring model:
//   +30 per exact topic match (case-insensitive)
//   +15 per keyword substring match in description (lowercase)
//   +10 if repo name contains a keyword (lowercase)
//   +50 if owner (or fullName) matches an ownerPrefix
//   final = sum * rule.weight
//   confidence = clamp(final / 100, 0, 1)
//
// Thresholds:
//   primary min to avoid fallback:     final >= 0.1 (raw pre-clamp)
//   secondary min confidence:          0.15
//
// Fallback when nothing fires: "devtools" with confidence 0.

import type { Repo } from "../../types";
import type {
  ClassificationMatch,
  ClassificationRule,
  PipelineCategoryId,
  RepoCategory,
} from "../types";
import { CLASSIFICATION_RULES } from "./rules";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const SCORE_TOPIC = 30;
const SCORE_KEYWORD_DESC = 15;
const SCORE_KEYWORD_NAME = 10;
const SCORE_OWNER_PREFIX = 50;

const PRIMARY_MIN_CONFIDENCE = 0.1;
const SECONDARY_MIN_CONFIDENCE = 0.15;

const FALLBACK_CATEGORY: PipelineCategoryId = "devtools";

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface ScoredRule {
  rule: ClassificationRule;
  rawScore: number;
  confidence: number;
  matchedTopics: string[];
  matchedKeywords: string[];
  matchedOwnerPrefix: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function scoreRule(rule: ClassificationRule, repo: Repo): ScoredRule {
  const description = normalize(repo.description);
  const name = normalize(repo.name);
  const owner = normalize(repo.owner);
  const fullName = normalize(repo.fullName);
  const topicsLower = (repo.topics ?? []).map((t) => t.toLowerCase());

  // Topic signal (highest)
  const matchedTopics: string[] = [];
  for (const topic of rule.topics) {
    const t = topic.toLowerCase();
    if (topicsLower.includes(t)) {
      matchedTopics.push(topic);
    }
  }

  // Keyword signal — check description + name separately
  const matchedKeywords: string[] = [];
  let keywordScore = 0;
  for (const keyword of rule.keywords) {
    const k = keyword.toLowerCase();
    if (!k) continue;
    let hit = false;
    if (description.includes(k)) {
      keywordScore += SCORE_KEYWORD_DESC;
      hit = true;
    }
    if (name.includes(k)) {
      keywordScore += SCORE_KEYWORD_NAME;
      hit = true;
    }
    if (hit) matchedKeywords.push(keyword);
  }

  // Owner prefix signal — match against owner OR fullName (e.g., "microsoft/playwright")
  let matchedOwnerPrefix: string | null = null;
  for (const prefix of rule.ownerPrefixes) {
    const p = prefix.toLowerCase();
    if (owner === p || fullName.startsWith(`${p}/`) || fullName === p || fullName.startsWith(p)) {
      matchedOwnerPrefix = prefix;
      break;
    }
  }

  const topicScore = matchedTopics.length * SCORE_TOPIC;
  const ownerScore = matchedOwnerPrefix ? SCORE_OWNER_PREFIX : 0;

  const rawSum = topicScore + keywordScore + ownerScore;
  const rawScore = rawSum * rule.weight;
  const confidence = Math.max(0, Math.min(1, rawScore / 100));

  return {
    rule,
    rawScore,
    confidence,
    matchedTopics,
    matchedKeywords,
    matchedOwnerPrefix,
  };
}

function toMatch(scored: ScoredRule): ClassificationMatch {
  return {
    categoryId: scored.rule.categoryId,
    confidence: scored.confidence,
    matched: {
      topics: scored.matchedTopics,
      keywords: scored.matchedKeywords,
      ownerPrefix: scored.matchedOwnerPrefix,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a single repo against all rules. Returns a RepoCategory with
 * primary + up to 2 secondary matches, or the "devtools" fallback when no
 * rule fires above the minimum threshold.
 */
export function classifyRepo(repo: Repo): RepoCategory {
  const scored = CLASSIFICATION_RULES.map((rule) => scoreRule(rule, repo))
    .filter((s) => s.rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore);

  const classifiedAt = new Date().toISOString();

  const top = scored[0];
  if (!top || top.rawScore < PRIMARY_MIN_CONFIDENCE) {
    return {
      repoId: repo.id,
      classifiedAt,
      primary: {
        categoryId: FALLBACK_CATEGORY,
        confidence: 0,
        matched: { topics: [], keywords: [], ownerPrefix: null },
      },
      secondary: [],
    };
  }

  const secondary = scored
    .slice(1)
    .filter((s) => s.confidence >= SECONDARY_MIN_CONFIDENCE)
    .slice(0, 2)
    .map(toMatch);

  return {
    repoId: repo.id,
    classifiedAt,
    primary: toMatch(top),
    secondary,
  };
}

/** Classify a batch of repos in one call. Pure, order-preserving. */
export function classifyBatch(repos: Repo[]): RepoCategory[] {
  return repos.map((r) => classifyRepo(r));
}

/**
 * Quick helper: match by topic signal ONLY. Returns the ordered list of
 * category IDs whose topic rules fire, ranked by (matches * weight) desc.
 * Useful for cheap pre-filtering or UI facets.
 */
export function classifyByTopics(topics: string[]): PipelineCategoryId[] {
  const normalized = topics.map((t) => t.toLowerCase());
  const ranked = CLASSIFICATION_RULES.map((rule) => {
    const matchCount = rule.topics.reduce((n, topic) => {
      return normalized.includes(topic.toLowerCase()) ? n + 1 : n;
    }, 0);
    return { categoryId: rule.categoryId, score: matchCount * rule.weight };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.map((r) => r.categoryId);
}
