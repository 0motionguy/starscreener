import type { SignalRow } from "@/components/signal/SignalTable";
import { getDataStore, type DataReadResult, type DataSource } from "./data-store";
import { resolveLogoUrl } from "./logo-url";

export type EcosystemLeaderboardKind = "skill" | "mcp";
export type SkillBoardId = "skills-sh" | "github";

export interface EcosystemLeaderboardItem {
  id: string;
  title: string;
  url: string;
  author: string | null;
  rank: number;
  description: string | null;
  topic: string;
  tags: string[];
  agents: string[];
  linkedRepo: string | null;
  popularity: number | null;
  popularityLabel: string;
  signalScore: number;
  postedAt: string | null;
  sourceLabel: string;
  /** Trending-MCP only — set on items where vendor detection matched. */
  vendor: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  verified: boolean;
  /** Number of registries this MCP appears in (1-4). */
  crossSourceCount: number;
}

export interface EcosystemBoard {
  id: SkillBoardId | "mcp";
  kind: EcosystemLeaderboardKind;
  label: string;
  key: string;
  fetchedAt: string | null;
  source: DataSource;
  ageMs: number;
  items: EcosystemLeaderboardItem[];
  meta: Record<string, number | string | null>;
}

export interface SkillsSignalData {
  fetchedAt: string | null;
  source: DataSource;
  ageMs: number;
  skillsSh: EcosystemBoard;
  github: EcosystemBoard;
  combined: EcosystemBoard;
}

export interface McpSignalData {
  fetchedAt: string | null;
  source: DataSource;
  ageMs: number;
  board: EcosystemBoard;
}

const SKILLS_SH_KEY = "trending-skill-sh";
const GITHUB_SKILLS_KEY = "trending-skill";
const MCP_KEY = "trending-mcp";

export async function getSkillsSignalData(): Promise<SkillsSignalData> {
  const store = getDataStore();
  const [skillsShRaw, githubRaw] = await Promise.all([
    store.read<unknown>(SKILLS_SH_KEY),
    store.read<unknown>(GITHUB_SKILLS_KEY),
  ]);
  const skillsSh = coerceSkillsShBoard(skillsShRaw);
  const github = coerceGithubSkillsBoard(githubRaw);
  const combinedItems = dedupeItems([...skillsSh.items, ...github.items])
    .sort((a, b) => b.signalScore - a.signalScore)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const combined: EcosystemBoard = {
    id: "skills-sh",
    kind: "skill",
    label: "All Skills",
    key: `${SKILLS_SH_KEY}+${GITHUB_SKILLS_KEY}`,
    fetchedAt: freshestIso([skillsSh.fetchedAt, github.fetchedAt]),
    source: bestSource([skillsSh.source, github.source]),
    ageMs: minFinite([skillsSh.ageMs, github.ageMs]),
    items: combinedItems,
    meta: {
      skillsSh: skillsSh.items.length,
      github: github.items.length,
    },
  };

  return {
    fetchedAt: combined.fetchedAt,
    source: combined.source,
    ageMs: combined.ageMs,
    skillsSh,
    github,
    combined,
  };
}

export async function getMcpSignalData(): Promise<McpSignalData> {
  const store = getDataStore();
  const raw = await store.read<unknown>(MCP_KEY);
  const board = coerceMcpBoard(raw);
  return {
    fetchedAt: board.fetchedAt,
    source: board.source,
    ageMs: board.ageMs,
    board,
  };
}

export function ecosystemBoardToRows(board: EcosystemBoard): SignalRow[] {
  return board.items.map((item) => {
    const badges: SignalRow["badges"] = [];
    if (item.verified) badges.push("verified");
    if (item.crossSourceCount >= 2) badges.push("linked-repo");
    // Prefer the explicit logoUrl if present; otherwise derive a logo from
    // the linked repo (GitHub owner avatar) or the item URL's hostname
    // (Google Favicons). Most skills/mcp items don't ship a logoUrl, so
    // this layered fallback is what makes the rows look alive instead of
    // monogram-only.
    const repoAvatar = item.linkedRepo
      ? `https://github.com/${encodeURIComponent(item.linkedRepo.split("/", 1)[0] ?? "")}.png?size=40`
      : null;
    const urlFavicon = resolveLogoUrl(item.url, item.title, 64);
    const resolvedLogo = item.logoUrl ?? repoAvatar ?? urlFavicon;
    return {
      id: `${board.kind}:${item.id}`,
      title: item.title,
      href: item.url,
      external: true,
      attribution: attribution(item),
      excerpt: item.description,
      source: board.kind === "mcp" ? "mcp" : "skills",
      topic: item.topic,
      linkedRepo: item.linkedRepo,
      engagement: item.popularity ?? undefined,
      engagementLabel: item.popularityLabel,
      postedAt: item.postedAt,
      signalScore: item.signalScore,
      badges: badges.length > 0 ? badges : undefined,
      logoUrl: resolvedLogo,
      brandColor: item.brandColor,
    };
  });
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function coerceSkillsShBoard(result: DataReadResult<unknown>): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt = asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const items = normalizeScores(
    rows
      .map((item, idx) => coerceSkillsShItem(item, idx + 1, fetchedAt))
      .filter((item): item is EcosystemLeaderboardItem => item !== null),
  );
  const sources = asRecord(obj?.sources);
  const views = asRecord(obj?.views);

  return {
    id: "skills-sh",
    kind: "skill",
    label: "skills.sh",
    key: SKILLS_SH_KEY,
    fetchedAt,
    source: result.source,
    ageMs: result.ageMs,
    items,
    meta: {
      seen: asNumber(sources?.skills_sh_total_seen),
      openclaw: asNumber(sources?.openclaw_compatible_count),
      hot: asNumber(views?.hot),
      trending: asNumber(views?.trending),
    },
  };
}

function coerceGithubSkillsBoard(result: DataReadResult<unknown>): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt = asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const items = normalizeScores(
    rows
      .map((item, idx) => coerceGithubSkillItem(item, idx + 1))
      .filter((item): item is EcosystemLeaderboardItem => item !== null),
  );
  const sources = asRecord(obj?.sources);

  return {
    id: "github",
    kind: "skill",
    label: "GitHub Skill Repos",
    key: GITHUB_SKILLS_KEY,
    fetchedAt,
    source: result.source,
    ageMs: result.ageMs,
    items,
    meta: {
      seen: asNumber(sources?.githubTotalSeen),
    },
  };
}

function coerceMcpBoard(result: DataReadResult<unknown>): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt =
    asString(obj?.generatedAt) ?? asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const items = normalizeScores(
    rows
      .map((item, idx) => coerceMcpItem(item, idx + 1, fetchedAt))
      .filter((item): item is EcosystemLeaderboardItem => item !== null),
  );

  return {
    id: "mcp",
    kind: "mcp",
    label: "MCP Servers",
    key: MCP_KEY,
    fetchedAt,
    source: result.source,
    ageMs: result.ageMs,
    items,
    meta: {
      seen: items.length,
    },
  };
}

function coerceSkillsShItem(
  raw: unknown,
  fallbackRank: number,
  fallbackDate: string | null,
): EcosystemLeaderboardItem | null {
  const item = asRecord(raw);
  if (!item) return null;
  const owner = asString(item.owner);
  const repo = asString(item.repo);
  const skillName = asString(item.skill_name) ?? asString(item.title);
  const id =
    asString(item.source_id) ??
    [owner, repo, skillName].filter(Boolean).join("/");
  const url = asString(item.url) ?? asString(item.github_url);
  if (!id || !skillName || !url) return null;

  const agents = asStringArray(item.agents).slice(0, 12);
  const linkedRepo = owner && repo ? `${owner}/${repo}` : null;
  const view = asString(item.view);
  const tags = [
    view,
    asBoolean(item.openclaw_compatible) ? "OpenClaw" : null,
    ...agents.slice(0, 4),
  ].filter((tag): tag is string => Boolean(tag));

  return {
    id,
    title: skillName,
    url,
    author: linkedRepo,
    rank: asNumber(item.rank) ?? fallbackRank,
    description: asString(item.description),
    topic: view ? view.replace("-", " ") : "skills.sh",
    tags,
    agents,
    linkedRepo,
    popularity: asNumber(item.installs),
    popularityLabel: "Installs",
    signalScore: asNumber(item.trending_score) ?? 0,
    postedAt: asString(item.last_pushed_at) ?? fallbackDate,
    sourceLabel: "skills.sh",
    vendor: null,
    logoUrl: null,
    brandColor: null,
    verified: false,
    crossSourceCount: 1,
  };
}

function coerceGithubSkillItem(
  raw: unknown,
  fallbackRank: number,
): EcosystemLeaderboardItem | null {
  const item = asRecord(raw);
  if (!item) return null;
  const fullName = asString(item.full_name);
  const title = asString(item.title) ?? leafName(fullName);
  const url = asString(item.url);
  if (!fullName || !title || !url) return null;

  return {
    id: fullName,
    title,
    url,
    author: asString(item.author) ?? fullName.split("/")[0] ?? null,
    rank: asNumber(item.rank) ?? fallbackRank,
    description: asString(item.description),
    topic: "GitHub",
    tags: asStringArray(item.source_topics).slice(0, 4),
    agents: [],
    linkedRepo: fullName,
    popularity: asNumber(item.stars),
    popularityLabel: "Stars",
    signalScore: asNumber(item.score) ?? 0,
    postedAt: asString(item.pushed_at) ?? asString(item.created_at),
    sourceLabel: "GitHub topics",
    vendor: null,
    logoUrl: null,
    brandColor: null,
    verified: false,
    crossSourceCount: 1,
  };
}

function coerceMcpItem(
  raw: unknown,
  fallbackRank: number,
  fallbackDate: string | null,
): EcosystemLeaderboardItem | null {
  const item = asRecord(raw);
  if (!item) return null;
  const id = asString(item.id) ?? asString(item.slug);
  const title = asString(item.title) ?? leafName(asString(item.slug));
  const url = asString(item.url);
  if (!id || !title || !url) return null;

  const metrics = asRecord(item.metrics);
  const popularity =
    asNumber(metrics?.installs_total) ??
    asNumber(metrics?.downloads_7d) ??
    asNumber(metrics?.stars_total) ??
    null;
  const popularityLabel =
    asNumber(metrics?.installs_total) !== null
      ? "Installs"
      : asNumber(metrics?.downloads_7d) !== null
        ? "Downloads"
        : "Stars";
  const slug = asString(item.slug);
  const linkedRepo = url.includes("github.com/")
    ? url.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "")
    : null;

  const vendor = asString(item.vendor);
  const logoUrl = asString(item.logo_url);
  const brandColor = asString(item.brand_color);
  const verified = asBoolean(item.is_official_vendor);
  const crossSourceCount = asNumber(item.cross_source_count) ?? 1;
  const tags = ["mcp"];
  if (vendor) tags.push(vendor);
  if (verified) tags.push("official");
  if (crossSourceCount >= 2) tags.push(`${crossSourceCount}× sources`);

  return {
    id,
    title,
    url,
    author: vendor,
    rank: asNumber(item.rank) ?? fallbackRank,
    description: asString(item.description),
    topic: vendor ?? (slug?.includes("/") ? slug.split("/")[0] ?? "MCP" : "MCP"),
    tags,
    agents: [],
    linkedRepo: linkedRepo && linkedRepo.includes("/") ? linkedRepo : null,
    popularity,
    popularityLabel,
    signalScore: asNumber(item.trending_score) ?? 0,
    postedAt: fallbackDate,
    sourceLabel: "MCP registries",
    vendor,
    logoUrl,
    brandColor,
    verified,
    crossSourceCount,
  };
}

function normalizeScores(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  const maxScore = Math.max(0, ...items.map((item) => item.signalScore));
  if (maxScore <= 0) {
    return items.map((item, idx) => ({ ...item, signalScore: rankScore(idx, items.length) }));
  }
  const shouldScale = maxScore > 100 || maxScore <= 20;
  return items.map((item, idx) => ({
    ...item,
    signalScore: shouldScale
      ? Math.max(1, Math.round((item.signalScore / maxScore) * 100))
      : Math.max(1, Math.min(100, Math.round(item.signalScore))),
    rank: item.rank || idx + 1,
  }));
}

function rankScore(index: number, total: number): number {
  if (total <= 1) return 100;
  return Math.max(1, Math.round(100 - (index / (total - 1)) * 70));
}

function dedupeItems(items: EcosystemLeaderboardItem[]): EcosystemLeaderboardItem[] {
  const seen = new Set<string>();
  const out: EcosystemLeaderboardItem[] = [];
  for (const item of items) {
    const key = (item.linkedRepo ?? item.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function attribution(item: EcosystemLeaderboardItem): string {
  const bits = [item.sourceLabel];
  if (item.author) bits.push(item.author);
  if (item.popularity !== null) {
    bits.push(`${formatCompact(item.popularity)} ${item.popularityLabel.toLowerCase()}`);
  }
  if (item.tags.length > 0) bits.push(item.tags.slice(0, 3).join(" / "));
  return bits.join(" / ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter((item): item is string => item !== null)
    : [];
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function leafName(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("/").pop() ?? value;
}

function freshestIso(values: Array<string | null>): string | null {
  let best = 0;
  let bestIso: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const t = Date.parse(value);
    if (!Number.isFinite(t) || t <= best) continue;
    best = t;
    bestIso = value;
  }
  return bestIso;
}

function bestSource(sources: DataSource[]): DataSource {
  if (sources.includes("redis")) return "redis";
  if (sources.includes("file")) return "file";
  if (sources.includes("memory")) return "memory";
  return "missing";
}

function minFinite(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Math.min(...finite) : 0;
}
