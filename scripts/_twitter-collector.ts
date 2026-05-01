import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import type {
  TwitterConfidence,
  TwitterIngestRequest,
  TwitterMatchedPost,
  TwitterMatchBy,
  TwitterQuery,
  TwitterQueryType,
  TwitterRepoInput,
  TwitterScanCandidate,
} from "../src/lib/twitter/types";

export interface CollectorRawPost {
  postId: string;
  postUrl: string;
  authorHandle: string;
  authorAvatarUrl?: string | null;
  postedAt: string;
  text: string;
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  sourceUrl?: string;
  /**
   * Resolved URLs from `entities.urls[].expanded_url` (Apify provider). Tweet
   * text only carries the t.co form; mention extractors must walk these to
   * catch shortened github.com URLs.
   */
  expandedUrls?: string[];
}

export interface CollectorOptions {
  windowHours: number;
  /** 0 means keep every matched post from the scan. */
  postsPerRepo: number;
  agentName: string;
  agentVersion: string;
  runId: string;
  triggeredBy: TwitterIngestRequest["scan"]["triggeredBy"];
  now?: Date;
}

export const DEFAULT_NITTER_INSTANCES = [
  "https://xcancel.com",
  "https://nitter.poast.org",
  "https://nitter.privacyredirect.com",
  "https://lightbrd.com",
  "https://nitter.space",
  "https://nitter.tiekoetter.com",
  "https://nuku.trabun.org",
  "https://nitter.catsarch.com",
  "https://nitter.kareem.one",
];

interface InstanceHealth {
  failures: number;
  nextTry: number;
}

const instanceHealth = new Map<string, InstanceHealth>();

export function isInstanceHealthy(instance: string): boolean {
  const health = instanceHealth.get(instance);
  if (!health) return true;
  return Date.now() >= health.nextTry;
}

export function recordInstanceSuccess(instance: string): void {
  instanceHealth.delete(instance);
}

export function recordInstanceFailure(instance: string): void {
  const current = instanceHealth.get(instance);
  const failures = (current?.failures ?? 0) + 1;
  const backoffMs = Math.min(2 ** failures * 1000, 60_000);
  instanceHealth.set(instance, { failures, nextTry: Date.now() + backoffMs });
}

const QUERY_TYPE_MATCH: Record<
  TwitterQueryType,
  { matchedBy: TwitterMatchBy; confidence: TwitterConfidence; context: string }
> = {
  repo_slug: {
    matchedBy: "repo_slug",
    confidence: "high",
    context: "repo_slug",
  },
  repo_url: {
    matchedBy: "url",
    confidence: "high",
    context: "github_url",
  },
  homepage_url: {
    matchedBy: "url",
    confidence: "high",
    context: "homepage",
  },
  docs_url: {
    matchedBy: "url",
    confidence: "high",
    context: "docs",
  },
  package_name: {
    matchedBy: "package_name",
    confidence: "high",
    context: "package_name",
  },
  project_name: {
    matchedBy: "phrase",
    confidence: "medium",
    context: "project_name",
  },
  repo_short_name: {
    matchedBy: "phrase",
    confidence: "medium",
    context: "repo_short_name",
  },
  owner_project_phrase: {
    matchedBy: "phrase",
    confidence: "medium",
    context: "owner",
  },
  alias: {
    matchedBy: "alias",
    confidence: "low",
    context: "alias",
  },
};

const GENERIC_PROJECT_CUES = new Set([
  "agent",
  "agents",
  "api",
  "app",
  "apps",
  "bot",
  "chat",
  "cli",
  "client",
  "code",
  "core",
  "data",
  "docs",
  "engine",
  "framework",
  "kit",
  "lib",
  "library",
  "model",
  "models",
  "plugin",
  "project",
  "repo",
  "sdk",
  "server",
  "service",
  "skill",
  "skills",
  "tool",
  "tools",
  "ui",
  "utils",
  "web",
]);

const DEVELOPER_CONTEXT_CUES = new Set([
  "agent",
  "agents",
  "ai",
  "api",
  "automation",
  "browser",
  "cli",
  "code",
  "coding",
  "developer",
  "dev",
  "docs",
  "framework",
  "github",
  "install",
  "llm",
  "mcp",
  "model",
  "npm",
  "open",
  "opensource",
  "package",
  "plugin",
  "python",
  "release",
  "repo",
  "rust",
  "sdk",
  "security",
  "server",
  "ship",
  "terminal",
  "tool",
  "tools",
  "typescript",
  "workflow",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function engagementForRawPost(post: CollectorRawPost): number {
  return (
    Math.max(0, Math.floor(post.likes ?? 0)) +
    Math.max(0, Math.floor(post.reposts ?? 0)) +
    Math.max(0, Math.floor(post.replies ?? 0)) +
    Math.max(0, Math.floor(post.quotes ?? 0))
  );
}

export function rankRawPosts(posts: CollectorRawPost[]): CollectorRawPost[] {
  return posts.slice().sort((a, b) => {
    const engagementDiff = engagementForRawPost(b) - engagementForRawPost(a);
    if (engagementDiff !== 0) return engagementDiff;
    return Date.parse(b.postedAt) - Date.parse(a.postedAt);
  });
}

function capPosts<T>(posts: T[], limit: number): T[] {
  if (limit <= 0) return posts;
  return posts.slice(0, limit);
}

function normalizeForMatch(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function normalizePhraseForText(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseVisibleInText(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizePhraseForText(text)} `;
  const normalizedPhrase = normalizePhraseForText(stripQueryQuotes(phrase));
  if (!normalizedPhrase) return false;

  const words = normalizedPhrase.split(" ").filter(Boolean);
  if (words.length === 1) {
    const [word] = words;
    return word.length >= 4 && normalizedText.includes(` ${word} `);
  }

  return normalizedText.includes(` ${words.join(" ")} `);
}

function isDistinctiveProjectCue(phrase: string): boolean {
  const tokens = normalizePhraseForText(phrase).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.some((token) => token.length >= 4 && !GENERIC_PROJECT_CUES.has(token));
}

function hasDeveloperContext(text: string): boolean {
  const normalized = normalizePhraseForText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.some((token) => DEVELOPER_CONTEXT_CUES.has(token))) return true;
  return (
    normalized.includes("open source") ||
    normalized.includes("pull request") ||
    normalized.includes("command line") ||
    normalized.includes("github com")
  );
}

function stripQueryQuotes(value: string): string {
  return value.trim().replace(/^"+|"+$/g, "");
}

export function normalizeNitterInstances(raw: string | undefined): string[] {
  const values = raw
    ? raw.split(",").map((value) => value.trim()).filter(Boolean)
    : DEFAULT_NITTER_INSTANCES;
  return Array.from(
    new Set(
      values.map((value) =>
        value.startsWith("http://") || value.startsWith("https://")
          ? value.replace(/\/+$/, "")
          : `https://${value.replace(/\/+$/, "")}`,
      ),
    ),
  );
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const named: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " ",
    };
    const lower = String(entity).toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

export function stripHtml(value: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

export function parseCompactCount(value: string | undefined): number {
  if (!value) return 0;
  const clean = value.trim().replace(/,/g, "");
  const match = clean.match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i);
  if (!match) return 0;
  const base = Number.parseFloat(match[1] ?? "0");
  const suffix = (match[2] ?? "").toLowerCase();
  const multiplier =
    suffix === "b" ? 1_000_000_000 : suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.max(0, Math.round(base * multiplier));
}

function extractTagValue(block: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(pattern);
  if (!match) return null;
  const raw = match[1] ?? "";
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return decodeHtmlEntities(cdata?.[1] ?? raw).trim();
}

function parseCanonicalPostUrl(rawUrl: string): {
  postId: string;
  postUrl: string;
  authorHandle: string;
} | null {
  let url: URL;
  try {
    url = new URL(rawUrl, "https://nitter.net");
  } catch {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const statusIndex = parts.findIndex((part) => part === "status");
  if (statusIndex <= 0 || !parts[statusIndex + 1]) return null;

  const authorHandle = parts[statusIndex - 1]?.replace(/^@+/, "");
  const postId = parts[statusIndex + 1]?.replace(/\D+$/g, "");
  if (!authorHandle || !postId) return null;

  return {
    postId,
    postUrl: `https://x.com/${encodeURIComponent(authorHandle)}/status/${postId}`,
    authorHandle,
  };
}

function parseDateToIso(value: string | null, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const normalized = decodeHtmlEntities(value).replace(/\s*·\s*/g, " ");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback.toISOString();
}

export function parseNitterRss(
  xml: string,
  sourceUrl: string,
  fallbackDate = new Date(),
): CollectorRawPost[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const posts: CollectorRawPost[] = [];

  for (const item of items) {
    const link = extractTagValue(item, "link") ?? extractTagValue(item, "guid");
    if (!link) continue;

    const canonical = parseCanonicalPostUrl(link);
    if (!canonical) continue;

    const title = extractTagValue(item, "title") ?? "";
    const description = extractTagValue(item, "description") ?? "";
    const text = stripHtml(description || title);
    if (!text) continue;

    posts.push({
      ...canonical,
      authorHandle: canonical.authorHandle,
      postedAt: parseDateToIso(extractTagValue(item, "pubDate"), fallbackDate),
      text,
      likes: 0,
      reposts: 0,
      replies: 0,
      quotes: 0,
      sourceUrl,
    });
  }

  return posts;
}

function extractHtmlStat(block: string, iconName: string): number {
  const pattern = new RegExp(
    `icon-${iconName}[\\s\\S]{0,240}?<span[^>]*class=["'][^"']*tweet-stat[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
    "i",
  );
  const match = block.match(pattern);
  return parseCompactCount(stripHtml(match?.[1] ?? ""));
}

function extractTweetContent(block: string): string {
  const match =
    block.match(/<div[^>]*class=["'][^"']*tweet-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ??
    block.match(/<p[^>]*class=["'][^"']*tweet-content[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  return stripHtml(match?.[1] ?? "");
}

export function parseNitterHtml(
  html: string,
  sourceUrl: string,
  fallbackDate = new Date(),
): CollectorRawPost[] {
  const { document } = parseHTML(html);
  const items = document.querySelectorAll(".timeline-item");
  const posts: CollectorRawPost[] = [];

  for (const item of items) {
    const linkEl =
      item.querySelector("a[href*='/status/']") ??
      item.querySelector("a[href*='/i/web/status/']");
    if (!linkEl) continue;

    const href = linkEl.getAttribute("href");
    if (!href) continue;

    const canonical = parseCanonicalPostUrl(href);
    if (!canonical) continue;

    const dateEl = item.querySelector(".tweet-date");
    const titleDate = dateEl?.getAttribute("title") ?? null;

    const contentEl = item.querySelector(".tweet-content");
    const text = stripHtml(contentEl?.innerHTML ?? "");
    if (!text) continue;

    const avatarEl = item.querySelector(".avatar");
    const avatar = avatarEl?.getAttribute("src") ?? null;

    posts.push({
      ...canonical,
      authorHandle: canonical.authorHandle,
      authorAvatarUrl: avatar ? new URL(avatar, sourceUrl).toString() : null,
      postedAt: parseDateToIso(titleDate, fallbackDate),
      text,
      replies: extractHtmlStatLinkedom(item, "comment"),
      reposts: extractHtmlStatLinkedom(item, "retweet"),
      quotes: extractHtmlStatLinkedom(item, "quote"),
      likes: extractHtmlStatLinkedom(item, "heart"),
      sourceUrl,
    });
  }

  return posts;
}

export function extractNitterNextPageUrl(
  html: string,
  sourceUrl: string,
): string | null {
  const { document } = parseHTML(html);
  const links = [
    ...Array.from(document.querySelectorAll(".show-more a[href]")),
    ...Array.from(document.querySelectorAll(".timeline-footer a[href]")),
    ...Array.from(document.querySelectorAll("a[href*='cursor=']")),
  ];
  const source = new URL(sourceUrl);

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href || !href.includes("cursor=")) continue;

    try {
      const next = new URL(href, sourceUrl);
      if (next.origin !== source.origin) continue;
      if (!next.pathname.includes("/search")) continue;
      return next.toString();
    } catch {
      continue;
    }
  }

  return null;
}

function extractHtmlStatLinkedom(item: Element, iconName: string): number {
  const icon = item.querySelector(`.icon-${iconName}`);
  if (!icon) return 0;
  const legacyStat = icon.nextElementSibling;
  if (legacyStat) {
    const legacyValue = parseCompactCount(stripHtml(legacyStat.innerHTML));
    if (legacyValue > 0) return legacyValue;
  }

  const closest =
    typeof icon.closest === "function"
      ? icon.closest(".tweet-stat")
      : null;
  const stat = closest ?? icon.parentElement;
  if (!stat) return 0;
  return parseCompactCount(stripHtml(stat.innerHTML));
}

export function nitterSearchUrls(instance: string, queryText: string): string[] {
  const q = encodeURIComponent(queryText);
  return [
    `${instance}/search?f=tweets&q=${q}`,
    `${instance}/search/rss?f=tweets&q=${q}`,
  ];
}

function matchedTermsFor(repo: TwitterRepoInput, query: TwitterQuery, text: string): string[] {
  const visibleProjectTerms = visibleProjectTermsFor(repo, text);
  const candidates = [
    ...visibleProjectTerms,
    query.queryText,
    stripQueryQuotes(query.queryText),
    repo.githubFullName,
    repo.githubUrl,
    `github.com/${repo.githubFullName}`,
    repo.repoName,
    repo.ownerName,
    ...(repo.packageNames ?? []),
    ...(repo.aliases ?? []),
  ];
  const normalizedText = normalizeForMatch(text);
  const out: string[] = [];

  for (const candidate of candidates) {
    const clean = stripQueryQuotes(candidate).trim();
    if (!clean) continue;
    const normalized = normalizeForMatch(clean);
    if (normalized && normalizedText.includes(normalized) && !out.includes(clean)) {
      out.push(clean);
    }
  }

  if (out.length === 0) {
    out.push(stripQueryQuotes(query.queryText));
  }

  return out.slice(0, 10);
}

function visibleProjectTermsFor(repo: TwitterRepoInput, text: string): string[] {
  const fullNameAsPhrase = repo.githubFullName.replace(/[\/_-]+/g, " ");
  const candidates = [
    repo.repoName,
    fullNameAsPhrase,
    ...(repo.aliases ?? []),
  ];
  const out: string[] = [];

  for (const candidate of candidates) {
    const clean = stripQueryQuotes(candidate).trim();
    if (!clean) continue;
    if (!isDistinctiveProjectCue(clean)) continue;
    if (phraseVisibleInText(text, clean) && !out.includes(clean)) {
      out.push(clean);
    }
  }

  return out;
}

function isHighPrecisionQuery(query: TwitterQuery): boolean {
  return (
    query.queryType === "repo_slug" ||
    query.queryType === "repo_url" ||
    query.queryType === "homepage_url" ||
    query.queryType === "docs_url" ||
    query.queryType === "package_name"
  );
}

function classifyMatch(
  repo: TwitterRepoInput,
  query: TwitterQuery,
  text: string,
): {
  matchedBy: TwitterMatchBy;
  confidence: TwitterConfidence;
  supportingContext: string[];
  whyMatched: string;
} {
  const normalizedText = normalizeForMatch(text);
  const fullName = normalizeForMatch(repo.githubFullName);
  const githubUrl = normalizeForMatch(repo.githubUrl);
  const packageHit = (repo.packageNames ?? []).some((pkg) =>
    normalizedText.includes(normalizeForMatch(pkg)),
  );
  const visibleProjectTerms = visibleProjectTermsFor(repo, text);
  const developerContext = hasDeveloperContext(text);

  if (normalizedText.includes(githubUrl) || normalizedText.includes(`github.com/${fullName}`)) {
    return {
      matchedBy: "url",
      confidence: "high",
      supportingContext: ["github_url", "repo_url"],
      whyMatched: "Contains the canonical GitHub repository URL.",
    };
  }

  if (normalizedText.includes(fullName)) {
    return {
      matchedBy: "repo_slug",
      confidence: "high",
      supportingContext: ["repo_slug"],
      whyMatched: "Contains the exact GitHub repo slug.",
    };
  }

  if (packageHit) {
    return {
      matchedBy: "package_name",
      confidence: "high",
      supportingContext: ["package_name"],
      whyMatched: "Contains an exact package name linked to the repo.",
    };
  }

  if (isHighPrecisionQuery(query)) {
    return {
      matchedBy: "phrase",
      confidence: "medium",
      supportingContext:
        visibleProjectTerms.length > 0
          ? [
              "source_query",
              "visible_project_phrase",
              QUERY_TYPE_MATCH[query.queryType].context,
              ...(developerContext ? ["developer_context"] : []),
            ]
          : ["source_query", QUERY_TYPE_MATCH[query.queryType].context],
      whyMatched:
        visibleProjectTerms.length > 0
          ? "Returned by a high-confidence repo query and contains a visible project phrase, but the exact URL, slug, or package name was not visible."
          : "Returned by a high-confidence repo query, but the exact URL, slug, package name, or project phrase was not visible in the post text.",
    };
  }

  const fallback = QUERY_TYPE_MATCH[query.queryType];
  return {
    matchedBy: fallback.matchedBy,
    confidence: fallback.confidence,
    supportingContext: [
      fallback.context,
      ...(developerContext ? ["developer_context"] : []),
    ],
    whyMatched:
      fallback.confidence === "high"
        ? "Matched through a high-confidence query for this repo."
        : fallback.confidence === "medium"
          ? "Matched through a repo-specific project phrase query."
          : "Matched through an alias fallback query.",
  };
}

function normalizeAuthorHandle(raw: CollectorRawPost): string {
  const fromPostUrl = parseCanonicalPostUrl(raw.postUrl)?.authorHandle;
  return (fromPostUrl || raw.authorHandle).replace(/^@+/, "").trim();
}

function shouldRejectSourceOnlyMatch(
  repo: TwitterRepoInput,
  query: TwitterQuery,
  raw: CollectorRawPost,
): boolean {
  if (!isHighPrecisionQuery(query)) return false;

  const match = classifyMatch(repo, query, raw.text);
  if (!match.supportingContext.includes("source_query")) return false;
  return visibleProjectTermsFor(repo, raw.text).length === 0;
}

function shouldRejectWeakPhraseMatch(
  repo: TwitterRepoInput,
  query: TwitterQuery,
  raw: CollectorRawPost,
): boolean {
  const match = classifyMatch(repo, query, raw.text);
  if (match.confidence !== "medium" || match.matchedBy !== "phrase") return false;

  const context = new Set(match.supportingContext);
  if (
    context.has("repo_slug") ||
    context.has("github_url") ||
    context.has("package_name") ||
    context.has("homepage") ||
    context.has("docs") ||
    context.has("developer_context")
  ) {
    return false;
  }

  return true;
}

export function toTwitterMatchedPost(
  repo: TwitterRepoInput,
  query: TwitterQuery,
  raw: CollectorRawPost,
): TwitterMatchedPost {
  const match = classifyMatch(repo, query, raw.text);
  return {
    postId: raw.postId,
    canonicalPostId: raw.postId,
    postUrl: raw.postUrl,
    authorHandle: normalizeAuthorHandle(raw),
    authorAvatarUrl: raw.authorAvatarUrl ?? null,
    authorId: null,
    postedAt: raw.postedAt,
    text: raw.text.slice(0, 20_000),
    likes: Math.max(0, Math.floor(raw.likes ?? 0)),
    reposts: Math.max(0, Math.floor(raw.reposts ?? 0)),
    replies: Math.max(0, Math.floor(raw.replies ?? 0)),
    quotes: Math.max(0, Math.floor(raw.quotes ?? 0)),
    authorFollowers: null,
    isRepost: false,
    matchedBy: match.matchedBy,
    confidence: match.confidence,
    matchedTerms: matchedTermsFor(repo, query, raw.text),
    whyMatched: match.whyMatched,
    supportingContext: match.supportingContext,
    sourceQuery: query.queryText,
    sourceQueryType: query.queryType,
  };
}

export function buildTwitterCollectorPayload(
  candidate: TwitterScanCandidate,
  queries: TwitterQuery[],
  postsByQuery: Map<string, CollectorRawPost[]>,
  options: CollectorOptions,
): TwitterIngestRequest {
  const completedAt = options.now ?? new Date();
  const startedAt = new Date(completedAt.getTime() - 5 * 60 * 1000);
  const windowStartMs = completedAt.getTime() - options.windowHours * 60 * 60 * 1000;
  const byPostId = new Map<string, TwitterMatchedPost>();
  let candidatePostsSeen = 0;

  for (const query of queries) {
    const rawPosts = postsByQuery.get(query.queryText) ?? [];
    candidatePostsSeen += rawPosts.length;
    for (const raw of rawPosts) {
      const postedMs = Date.parse(raw.postedAt);
      if (!Number.isFinite(postedMs)) continue;
      if (postedMs < windowStartMs || postedMs > completedAt.getTime()) continue;
      if (shouldRejectSourceOnlyMatch(candidate.repo, query, raw)) continue;
      if (shouldRejectWeakPhraseMatch(candidate.repo, query, raw)) continue;
      const matched = toTwitterMatchedPost(candidate.repo, query, raw);
      const existing = byPostId.get(matched.postId);
      if (!existing) {
        byPostId.set(matched.postId, matched);
        continue;
      }
      const existingRank = existing.confidence === "high" ? 3 : existing.confidence === "medium" ? 2 : 1;
      const matchedRank = matched.confidence === "high" ? 3 : matched.confidence === "medium" ? 2 : 1;
      if (matchedRank > existingRank) {
        byPostId.set(matched.postId, matched);
      }
    }
  }

  const posts = capPosts(
    Array.from(byPostId.values()).sort((a, b) => {
      const engagementDiff =
        engagementForRawPost(b) - engagementForRawPost(a);
      if (engagementDiff !== 0) return engagementDiff;
      return Date.parse(b.postedAt) - Date.parse(a.postedAt);
    }),
    Math.max(0, options.postsPerRepo),
  );

  const repoKey = candidate.repo.repoId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  const rejectedPosts = Math.max(0, candidatePostsSeen - posts.length);

  // Deterministic scanId so retries of the same run are idempotent
  const scanId = `nitter-${repoKey}-${options.runId}`;

  return {
    version: "v1",
    source: "twitter",
    agent: {
      name: options.agentName,
      version: options.agentVersion,
      runId: options.runId,
    },
    repo: candidate.repo,
    scan: {
      scanId,
      scanType: "targeted_repo_scan",
      triggeredBy: options.triggeredBy,
      windowHours: options.windowHours,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      status: "completed",
    },
    queries: queries.map((query) => ({
      ...query,
      matchCount: postsByQuery.get(query.queryText)?.length ?? 0,
    })),
    posts,
    rawSummary: {
      candidatePostsSeen,
      acceptedPosts: posts.length,
      rejectedPosts,
      rateLimited: false,
      timeoutHit: false,
      challengeDetected: false,
    },
  };
}
