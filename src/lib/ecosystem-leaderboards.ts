import type { SignalRow } from "@/components/signal/SignalTable";
import { getDataStore, type DataReadResult, type DataSource } from "./data-store";
import { resolveLogoUrl } from "./logo-url";
import { skillScorer, type SkillItem } from "./pipeline/scoring/domain/skill";
import { mcpScorer, type McpItem } from "./pipeline/scoring/domain/mcp";
import { computeCrossDomainMomentum } from "./pipeline/scoring/cross-domain";
import type {
  DomainItem,
  DomainKey,
  ScoredItem,
} from "./pipeline/scoring/domain/types";

export type EcosystemLeaderboardKind = "skill" | "mcp";
export type SkillBoardId = "skills-sh" | "github";

/**
 * Liveness signal for an MCP item. `undefined` for skills and for MCP rows
 * where Chunk C's MCP-ping job hasn't populated the field yet — UI renders
 * a `?` "pending" pill in that case. `isStdio` short-circuits to a "stdio
 * inferred" pill regardless of `uptime7d`.
 */
export interface LivenessInfo {
  uptime7d?: number; // 0..1
  isStdio?: boolean;
  isInferred?: boolean;
}

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
  /**
   * Liveness signal — populated for MCP items only, undefined for skills.
   * Cold-start: always `undefined` (no MCP-ping data yet) — UI shows a
   * "pending" pill until Chunk C ships ping data.
   */
  liveness?: LivenessInfo;
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
const MCP_LIVENESS_KEY = "mcp-liveness";
const AWESOME_SKILLS_KEY = "awesome-skills";

// ---------------------------------------------------------------------------
// Side-channel signal joins
//
// `mcp-liveness` (populated by scripts/ping-mcp-liveness.mjs every 6h):
//   { fetchedAt, summary: { [slug]: { uptime7d, p50LatencyMs, toolCount,
//                                     isStdio, livenessInferred } } }
//
// `awesome-skills` (populated by scripts/scrape-awesome-skills.mjs daily):
//   { fetchedAt, lists: string[], indexBySkill: { [ownerRepoLower]: string[] } }
//
// Both keys are OPTIONAL. When absent (cold start, before the corresponding
// workflow has run), the readers below return empty maps and the scorers
// drop their dependent terms cleanly via the existing weight-renormalize
// path. UI behavior is unchanged from current MVP.
// ---------------------------------------------------------------------------

interface McpLivenessSummaryEntry {
  uptime7d?: number;
  p50LatencyMs?: number;
  toolCount?: number;
  isStdio?: boolean;
  livenessInferred?: boolean;
}

async function loadMcpLivenessSummary(): Promise<Record<string, McpLivenessSummaryEntry>> {
  const store = getDataStore();
  const result = await store.read<unknown>(MCP_LIVENESS_KEY);
  const obj = asRecord(result.data);
  const summary = asRecord(obj?.summary);
  if (!summary) return {};
  const out: Record<string, McpLivenessSummaryEntry> = {};
  for (const [slug, raw] of Object.entries(summary)) {
    const entry = asRecord(raw);
    if (!entry) continue;
    out[slug] = {
      uptime7d: asNumber(entry.uptime7d) ?? undefined,
      p50LatencyMs: asNumber(entry.p50LatencyMs) ?? undefined,
      toolCount: asNumber(entry.toolCount) ?? undefined,
      isStdio: asBoolean(entry.isStdio),
      livenessInferred: asBoolean(entry.livenessInferred),
    };
  }
  return out;
}

async function loadAwesomeSkillsIndex(): Promise<Record<string, string[]>> {
  const store = getDataStore();
  const result = await store.read<unknown>(AWESOME_SKILLS_KEY);
  const obj = asRecord(result.data);
  const idx = asRecord(obj?.indexBySkill);
  if (!idx) return {};
  const out: Record<string, string[]> = {};
  for (const [skill, lists] of Object.entries(idx)) {
    if (Array.isArray(lists)) {
      const clean = lists.map((l) => asString(l)).filter((l): l is string => l !== null);
      if (clean.length > 0) out[skill.toLowerCase()] = clean;
    }
  }
  return out;
}

export async function getSkillsSignalData(): Promise<SkillsSignalData> {
  const store = getDataStore();
  const [skillsShRaw, githubRaw, awesomeIndex] = await Promise.all([
    store.read<unknown>(SKILLS_SH_KEY),
    store.read<unknown>(GITHUB_SKILLS_KEY),
    loadAwesomeSkillsIndex(),
  ]);
  const skillsSh = coerceSkillsShBoard(skillsShRaw, awesomeIndex);
  const github = coerceGithubSkillsBoard(githubRaw, awesomeIndex);
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
  const [raw, livenessSummary] = await Promise.all([
    store.read<unknown>(MCP_KEY),
    loadMcpLivenessSummary(),
  ]);
  const board = coerceMcpBoard(raw, livenessSummary);
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

function coerceSkillsShBoard(
  result: DataReadResult<unknown>,
  awesomeIndex: Record<string, string[]> = {},
): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt = asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const pairs = rows
    .map((item, idx) => coerceSkillsShItem(item, idx + 1, fetchedAt))
    .filter((p): p is { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } => p !== null);
  const items = applySkillMomentum(pairs, awesomeIndex);
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

function coerceGithubSkillsBoard(
  result: DataReadResult<unknown>,
  awesomeIndex: Record<string, string[]> = {},
): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt = asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const pairs = rows
    .map((item, idx) => coerceGithubSkillItem(item, idx + 1))
    .filter((p): p is { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } => p !== null);
  const items = applySkillMomentum(pairs, awesomeIndex);
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

function coerceMcpBoard(
  result: DataReadResult<unknown>,
  livenessSummary: Record<string, McpLivenessSummaryEntry> = {},
): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt =
    asString(obj?.generatedAt) ?? asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const pairs = rows
    .map((item, idx) => coerceMcpItem(item, idx + 1, fetchedAt, livenessSummary))
    .filter((p): p is { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } => p !== null);
  const items = applyMcpMomentum(pairs);

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
): { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } | null {
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
    item: {
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
      // Placeholder — overwritten by applySkillMomentum below.
      signalScore: 0,
      postedAt: asString(item.last_pushed_at) ?? fallbackDate,
      sourceLabel: "skills.sh",
      vendor: null,
      logoUrl: null,
      brandColor: null,
      verified: false,
      crossSourceCount: 1,
    },
    raw: item,
  };
}

function coerceGithubSkillItem(
  raw: unknown,
  fallbackRank: number,
): { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } | null {
  const item = asRecord(raw);
  if (!item) return null;
  const fullName = asString(item.full_name);
  const title = asString(item.title) ?? leafName(fullName);
  const url = asString(item.url);
  if (!fullName || !title || !url) return null;

  return {
    item: {
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
      // Placeholder — overwritten by applySkillMomentum below.
      signalScore: 0,
      postedAt: asString(item.pushed_at) ?? asString(item.created_at),
      sourceLabel: "GitHub topics",
      vendor: null,
      logoUrl: null,
      brandColor: null,
      verified: false,
      crossSourceCount: 1,
    },
    raw: item,
  };
}

function coerceMcpItem(
  raw: unknown,
  fallbackRank: number,
  fallbackDate: string | null,
  livenessSummary: Record<string, McpLivenessSummaryEntry> = {},
): { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } | null {
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

  // Side-channel liveness lookup. `summary[slug]` is undefined when the
  // pinger hasn't seen this server yet → liveness stays undefined → UI
  // shows the "pending" pill (existing behavior). When present, we copy
  // both into the user-facing `liveness` field AND stash the full entry
  // on the raw record so buildMcpItem() can plumb the per-component
  // numeric inputs into the scorer.
  const livenessKey = slug ?? id;
  const livenessEntry = livenessKey ? livenessSummary[livenessKey] : undefined;
  const liveness: LivenessInfo | undefined = livenessEntry
    ? {
        uptime7d: livenessEntry.uptime7d,
        isStdio: livenessEntry.isStdio,
        isInferred: livenessEntry.livenessInferred,
      }
    : undefined;
  // Mutate a shallow copy so we don't pollute the cached payload object.
  const enrichedRaw: Record<string, unknown> = livenessEntry
    ? { ...item, __liveness: livenessEntry }
    : item;

  return {
    item: {
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
      // Placeholder — overwritten by applyMcpMomentum below.
      signalScore: 0,
      postedAt: fallbackDate,
      sourceLabel: "MCP registries",
      vendor,
      logoUrl,
      brandColor,
      verified,
      crossSourceCount,
      liveness,
    },
    raw: enrichedRaw,
  };
}

// ---------------------------------------------------------------------------
// New-pipeline scoring: skill / mcp domain scorers feed
// computeCrossDomainMomentum, and the resulting `momentum` overwrites
// `signalScore` (still 0..100). Replaces the old normalizeScores()
// passthrough of the collector's raw `trending_score`.
// ---------------------------------------------------------------------------

function applySkillMomentum(
  pairs: Array<{ item: EcosystemLeaderboardItem; raw: Record<string, unknown> }>,
  awesomeIndex: Record<string, string[]> = {},
): EcosystemLeaderboardItem[] {
  if (pairs.length === 0) return [];
  const skillItems: SkillItem[] = pairs.map(({ item, raw }) =>
    buildSkillItem(item, raw, awesomeIndex),
  );
  const scored = skillScorer.computeRaw(skillItems);
  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["skill", scored as unknown as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("skill") ?? [];
  // ranked preserves input order — splice momentum back in by index.
  return pairs.map((p, i) => {
    const r = ranked[i];
    const momentum = r ? Math.round(r.momentum) : 0;
    return {
      ...p.item,
      signalScore: Math.max(1, Math.min(100, momentum)),
      rank: p.item.rank || i + 1,
    };
  });
}

function applyMcpMomentum(
  pairs: Array<{ item: EcosystemLeaderboardItem; raw: Record<string, unknown> }>,
): EcosystemLeaderboardItem[] {
  if (pairs.length === 0) return [];
  const mcpItems: McpItem[] = pairs.map(({ item, raw }) => buildMcpItem(item, raw));
  const scored = mcpScorer.computeRaw(mcpItems);
  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["mcp", scored as unknown as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("mcp") ?? [];
  return pairs.map((p, i) => {
    const r = ranked[i];
    const momentum = r ? Math.round(r.momentum) : 0;
    return {
      ...p.item,
      signalScore: Math.max(1, Math.min(100, momentum)),
      rank: p.item.rank || i + 1,
    };
  });
}

/**
 * Map a raw skill row → SkillItem for the domain scorer. Both skills.sh
 * (`installs`, `last_pushed_at`) and GitHub-topic (`stars`, `forks`,
 * `pushed_at`) shapes flow through this — fields not present in a given
 * shape are left undefined and the scorer renormalizes weights.
 *
 * Cold-start limitations (Chunk F MVP):
 *   - `installsPrev7d` is undefined → installsDelta7d component is dropped.
 *     Chunk C will deliver historical snapshots.
 *   - `inAwesomeLists` is undefined → component defaults to 0 (still
 *     emitted, just no contribution). Populated when Chunk C lands the
 *     awesome-lists scraper.
 *   - `commitVelocity30d` is undefined → defaults to 0. Out of scope (would
 *     need a per-row GitHub commits API call).
 */
function buildSkillItem(
  item: EcosystemLeaderboardItem,
  raw: Record<string, unknown>,
  awesomeIndex: Record<string, string[]> = {},
): SkillItem {
  const installs7d = asNumber(raw.installs); // skills.sh
  const stars = asNumber(raw.stars); // both shapes (when present)
  const forks = asNumber(raw.forks); // GitHub-topic shape
  const lastPushedAt =
    asString(raw.last_pushed_at) ??
    asString(raw.pushed_at) ??
    item.postedAt ??
    undefined;
  // Reverse-lookup which awesome-* lists mention this skill repo. Empty
  // → undefined so the scorer treats it as 0 contribution (same as before).
  const linkedRepoLower = item.linkedRepo ? item.linkedRepo.toLowerCase() : null;
  const inAwesomeLists =
    linkedRepoLower && awesomeIndex[linkedRepoLower]
      ? awesomeIndex[linkedRepoLower]
      : undefined;
  return {
    domainKey: "skill",
    id: item.id,
    joinKeys: { repoFullName: item.linkedRepo ?? undefined },
    installs7d: installs7d !== null ? installs7d : undefined,
    installsPrev7d: undefined,
    stars: stars !== null ? stars : undefined,
    forks: forks !== null ? forks : undefined,
    agents: item.agents,
    inAwesomeLists,
    commitVelocity30d: undefined,
    lastPushedAt: lastPushedAt ?? undefined,
  };
}

/**
 * Map a raw MCP row (LeaderboardItem) → McpItem for the domain scorer.
 *
 * Cold-start limitations (Chunk F MVP):
 *   - `metrics.downloads_7d` is treated as `npmDownloads7d`. The publish
 *     payload doesn't split npm vs pypi; for ranking purposes the combined
 *     log-norm is fine.
 *   - `livenessUptime7d`, `isStdio`, `toolCount`, `smitheryRank`,
 *     `npmDependents`, `p50LatencyMs` are all undefined. The scorer drops
 *     each missing component and renormalizes weights — net result: with
 *     today's payload the score is driven by `downloadsCombined7d` +
 *     `crossSourceCount`. Chunk C populates the rest.
 */
function buildMcpItem(
  item: EcosystemLeaderboardItem,
  raw: Record<string, unknown>,
): McpItem {
  const metrics = asRecord(raw.metrics);
  const downloads7d = asNumber(metrics?.downloads_7d);
  const npmName = item.linkedRepo
    ? leafName(item.linkedRepo) ?? undefined
    : undefined;
  // Liveness data was stashed under raw.__liveness by coerceMcpItem when
  // the mcp-liveness Redis key existed. Cold-start: stays undefined and
  // the scorer drops every term except crossSourceCount + downloads.
  const liveness = asRecord(raw.__liveness);
  return {
    domainKey: "mcp",
    id: item.id,
    joinKeys: { npmName, repoFullName: item.linkedRepo ?? undefined },
    npmDownloads7d: downloads7d !== null ? downloads7d : undefined,
    pypiDownloads7d: undefined,
    livenessUptime7d: liveness ? asNumber(liveness.uptime7d) ?? undefined : undefined,
    livenessInferred: liveness ? asBoolean(liveness.livenessInferred) : false,
    toolCount: liveness ? asNumber(liveness.toolCount) ?? undefined : undefined,
    smitheryRank: undefined,
    smitheryTotal: undefined,
    npmDependents: undefined,
    crossSourceCount: item.crossSourceCount,
    p50LatencyMs: liveness ? asNumber(liveness.p50LatencyMs) ?? undefined : undefined,
    isStdio: liveness ? asBoolean(liveness.isStdio) : false,
  };
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
