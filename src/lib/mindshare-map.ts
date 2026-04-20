import { CATEGORIES } from "./constants";
import {
  loadAllCollections,
  type CollectionFile,
} from "./collections";
import { TAG_RULES } from "./pipeline/classification/tag-rules";
import type { Repo } from "./types";

export interface MindshareRepo {
  id: string;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  href: string;
  value24h: number;
  momentumScore: number;
}

export interface MindshareGroup {
  id: string;
  label: string;
  color: string;
  total24h: number;
  sharePct: number;
  repos: MindshareRepo[];
}

export interface MindshareGroupOptions {
  collections?: CollectionFile[];
  includeCategoryFallback?: boolean;
  maxGroups?: number;
  reposPerGroup?: number;
}

export interface TreemapRect<T> {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Bucket = Pick<MindshareGroup, "id" | "label" | "color">;

const TAG_PRIORITY = [
  "mcp",
  "agent-skills",
  "claude-code",
  "agent-memory",
  "ai-agents",
  "swarm-orchestration",
  "local-llm",
  "llm-infra",
];

const TAG_COLORS: Record<string, string> = {
  "mcp": "#14b8a6",
  "claude-code": "#22c55e",
  "agent-memory": "#a855f7",
  "agent-skills": "#f43f5e",
  "ai-agents": "#f59e0b",
  "swarm-orchestration": "#06b6d4",
  "local-llm": "#6366f1",
  "llm-infra": "#8b5cf6",
};

const CATEGORY_LABELS: Record<string, string> = {
  "ai-agents": "Agents",
  "mcp": "MCP",
  "devtools": "DevTools",
  "browser-automation": "Browser Automation",
  "local-llm": "Local LLM",
  "security": "Security",
  "infrastructure": "Infra",
  "design-engineering": "Design Eng",
  "ai-ml": "AI/ML",
  "web-frameworks": "Web",
  "databases": "Databases",
  "mobile": "Mobile",
  "data-analytics": "Data",
  "crypto-web3": "Web3",
  "rust-ecosystem": "Rust",
};

const CATEGORY_COLORS: Record<string, string> = {
  "ai-agents": "#f59e0b",
  "mcp": "#14b8a6",
  "devtools": "#fb923c",
  "browser-automation": "#0ea5e9",
  "local-llm": "#6366f1",
  "security": "#ef4444",
  "infrastructure": "#10b981",
  "design-engineering": "#ec4899",
};

const KEYWORD_BUCKETS: Array<Bucket & { patterns: RegExp[] }> = [
  {
    id: "mcp",
    label: "MCP",
    color: TAG_COLORS.mcp,
    patterns: [/\bmcp\b/i, /model context protocol/i],
  },
  {
    id: "agent-skills",
    label: "Skills",
    color: TAG_COLORS["agent-skills"],
    patterns: [/\bagentic skills?\b/i, /\bagent skills?\b/i, /\bskills?\b/i],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    color: TAG_COLORS["claude-code"],
    patterns: [/\bclaude[-\s]?code\b/i, /\banthropic\b/i, /\bclaude cli\b/i],
  },
  {
    id: "agent-memory",
    label: "Agent Memory",
    color: TAG_COLORS["agent-memory"],
    patterns: [
      /\bagent memory\b/i,
      /\blong[-\s]?term memory\b/i,
      /\bmemory layer\b/i,
      /\bmem0\b/i,
      /\bletta\b/i,
      /\brag\b/i,
      /\bknowledge graph\b/i,
    ],
  },
  {
    id: "coding-agents",
    label: "Coding Agents",
    color: "#d97706",
    patterns: [
      /\bcoding agents?\b/i,
      /\bcode agents?\b/i,
      /\bai coding\b/i,
      /\bcodex\b/i,
      /\bopencode\b/i,
      /\bcursor\b/i,
      /\bdevin\b/i,
      /\baider\b/i,
    ],
  },
  {
    id: "ai-prompts",
    label: "AI Prompts",
    color: "#3b82f6",
    patterns: [/\bsystem prompts?\b/i, /\bprompts?\b/i],
  },
  {
    id: "ai-agent-frameworks",
    label: "AI Agent Frameworks",
    color: "#f59e0b",
    patterns: [
      /\bai agents?\b/i,
      /\bagentic\b/i,
      /\bautonomous agents?\b/i,
      /\bmulti[-\s]?agent\b/i,
      /\bagent framework\b/i,
      /\bagents?\b/i,
    ],
  },
  {
    id: "llm-tools",
    label: "LLM Tools",
    color: "#8b5cf6",
    patterns: [
      /\bllms?\b/i,
      /\bchatgpt\b/i,
      /\bgemini\b/i,
      /\bgrok\b/i,
      /\bopenai\b/i,
    ],
  },
];

const COLLECTION_COLORS = [
  "#2dd4bf",
  "#60a5fa",
  "#a78bfa",
  "#f59e0b",
  "#22c55e",
  "#f43f5e",
  "#38bdf8",
  "#fb7185",
  "#c084fc",
  "#34d399",
  "#f97316",
  "#818cf8",
];

const TAG_RULE_BY_ID = new Map(TAG_RULES.map((rule) => [rule.tagId, rule]));
const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function repoHref(repo: Repo): string {
  return `/repo/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

function collectionColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return COLLECTION_COLORS[hash % COLLECTION_COLORS.length];
}

function collectionNameToId(name: string): string {
  return name
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildCollectionIndex(collections: CollectionFile[]): Map<string, CollectionFile> {
  const out = new Map<string, CollectionFile>();
  for (const collection of collections) {
    for (const item of collection.items) {
      const key = item.toLowerCase();
      if (!out.has(key)) out.set(key, collection);
    }
  }
  return out;
}

function searchableText(repo: Repo): string {
  return [
    repo.fullName,
    repo.name,
    repo.description,
    repo.language ?? "",
    ...(repo.topics ?? []),
    ...(repo.tags ?? []),
    ...(repo.collectionNames ?? []),
  ].join(" ");
}

function pickUpstreamCollectionBucket(repo: Repo): Bucket | null {
  const name = repo.collectionNames?.find((collectionName) => collectionName.trim());
  if (!name) return null;
  const id = collectionNameToId(name);
  return {
    id,
    label: name,
    color: collectionColor(id),
  };
}

function pickKeywordBucket(repo: Repo): Bucket | null {
  const text = searchableText(repo);
  const hit = KEYWORD_BUCKETS.find((bucket) =>
    bucket.patterns.some((pattern) => pattern.test(text)),
  );
  if (!hit) return null;
  return {
    id: hit.id,
    label: hit.label,
    color: hit.color,
  };
}

function pickFallbackBucket(repo: Repo, includeCategoryFallback: boolean): Bucket | null {
  const tags = repo.tags ?? [];
  const tag =
    TAG_PRIORITY.find((tagId) => tags.includes(tagId)) ??
    tags.find((tagId) => TAG_RULE_BY_ID.has(tagId));

  if (tag) {
    const rule = TAG_RULE_BY_ID.get(tag);
    return {
      id: tag,
      label: rule?.label ?? tag,
      color: TAG_COLORS[tag] ?? "#60a5fa",
    };
  }

  const keywordBucket = pickKeywordBucket(repo);
  if (keywordBucket) return keywordBucket;

  if (!includeCategoryFallback) return null;

  const category = CATEGORY_BY_ID.get(repo.categoryId);
  return {
    id: repo.categoryId,
    label: category?.shortName ?? CATEGORY_LABELS[repo.categoryId] ?? repo.categoryId,
    color: CATEGORY_COLORS[repo.categoryId] ?? category?.color ?? "#64748b",
  };
}

export function buildMindshareGroups(
  repos: Repo[],
  options: MindshareGroupOptions = {},
): MindshareGroup[] {
  const collections = options.collections ?? loadAllCollections();
  const collectionByRepo = buildCollectionIndex(collections);
  const includeCategoryFallback = options.includeCategoryFallback ?? true;
  const maxGroups = options.maxGroups ?? 16;
  const reposPerGroup = options.reposPerGroup ?? 7;
  const buckets = new Map<string, MindshareGroup>();

  for (const repo of repos) {
    const value24h = Math.max(0, Math.round(repo.starsDelta24h));
    if (value24h <= 0) continue;

    const collection = collectionByRepo.get(repo.fullName.toLowerCase());
    const bucket = collection
      ? {
          id: collection.slug,
          label: collection.name,
          color: collectionColor(collection.slug),
        }
      : pickUpstreamCollectionBucket(repo) ??
        pickFallbackBucket(repo, includeCategoryFallback);
    if (!bucket) continue;

    const current =
      buckets.get(bucket.id) ??
      {
        ...bucket,
        total24h: 0,
        sharePct: 0,
        repos: [],
      };

    current.total24h += value24h;
    current.repos.push({
      id: repo.id,
      fullName: repo.fullName,
      name: repo.name,
      owner: repo.owner,
      ownerAvatarUrl: repo.ownerAvatarUrl,
      href: repoHref(repo),
      value24h,
      momentumScore: repo.momentumScore,
    });

    buckets.set(bucket.id, current);
  }

  const groups = Array.from(buckets.values()).sort(
    (a, b) => b.total24h - a.total24h || a.label.localeCompare(b.label),
  );
  const visible = groups.slice(0, maxGroups);
  const total = visible.reduce((sum, group) => sum + group.total24h, 0);

  return visible.map((group) => ({
    ...group,
    sharePct: total > 0 ? round1((group.total24h / total) * 100) : 0,
    repos: [...group.repos]
      .sort(
        (a, b) =>
          b.value24h - a.value24h ||
          b.momentumScore - a.momentumScore ||
          a.fullName.localeCompare(b.fullName),
      )
      .slice(0, reposPerGroup),
  }));
}

function splitWeighted<T extends { value: number }>(
  items: T[],
): [T[], T[]] {
  if (items.length <= 1) return [items, []];

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const target = total / 2;
  let running = 0;
  let splitAt = 1;

  for (let i = 0; i < items.length - 1; i += 1) {
    const next = running + items[i].value;
    if (Math.abs(target - next) <= Math.abs(target - running)) {
      running = next;
      splitAt = i + 1;
    } else {
      break;
    }
  }

  return [items.slice(0, splitAt), items.slice(splitAt)];
}

export function layoutTreemap<T extends { value: number }>(
  items: T[],
  width: number,
  height: number,
): TreemapRect<T>[] {
  const positive = items.filter((item) => item.value > 0);
  const out: TreemapRect<T>[] = [];

  function layout(slice: T[], x: number, y: number, w: number, h: number): void {
    if (slice.length === 0 || w <= 0 || h <= 0) return;
    if (slice.length === 1) {
      out.push({ item: slice[0], x, y, width: w, height: h });
      return;
    }

    const [left, right] = splitWeighted(slice);
    const leftTotal = left.reduce((sum, item) => sum + item.value, 0);
    const total = leftTotal + right.reduce((sum, item) => sum + item.value, 0);
    const ratio = total > 0 ? leftTotal / total : 0.5;

    if (w >= h) {
      const leftWidth = w * ratio;
      layout(left, x, y, leftWidth, h);
      layout(right, x + leftWidth, y, w - leftWidth, h);
    } else {
      const topHeight = h * ratio;
      layout(left, x, y, w, topHeight);
      layout(right, x, y + topHeight, w, h - topHeight);
    }
  }

  layout(
    [...positive].sort((a, b) => b.value - a.value),
    0,
    0,
    width,
    height,
  );
  return out;
}
