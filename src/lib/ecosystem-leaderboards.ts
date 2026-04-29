import type { SignalRow } from "@/components/signal/SignalTable";
import { getDataStore, type DataReadResult, type DataSource } from "./data-store";
import { resolveLogoUrl } from "./logo-url";
import { mcpEntityLogoUrl, repoLogoUrl } from "./logos";
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
 * Rollback flag for the new scorer signals shipped in this wave.
 * When `SCORING_USE_LEGACY=1`, the side-channel reads (npm/pypi downloads,
 * smithery rank, npm dependents, skill derivative count, skill install
 * snapshot) are skipped at the leaderboard-build step. The scorers'
 * renormalization drops the now-undefined terms, effectively reverting
 * each domain to the pre-wave subset of weights without code rollback.
 *
 * Intended use: cutover safety valve. If the new ranking misbehaves in
 * production, set the env var on Vercel + the worker, redeploy, and the
 * old shape comes back without a revert PR. Tests in shadow CI verify
 * the flag wires through.
 */
function legacyScoringEnabled(): boolean {
  const v = process.env.SCORING_USE_LEGACY;
  return v === "1" || v === "true";
}

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

/**
 * MCP-specific display fields. Mirrors the inputs `buildMcpItem` reads from
 * raw side-channel data — `coerceMcpItem` populates this so the page can
 * render columns without re-doing the side-channel join. All optional —
 * any missing field renders as a dash.
 */
export interface McpDisplayFields {
  /** Detected transport hint. `null` when unknown. */
  transport: "stdio" | "http" | "sse" | "streamable-http" | null;
  /** Convenience flag: `true` when the server is stdio-only (no HTTP probe). */
  isStdio: boolean;
  /** npm or pypi package name when known. */
  packageName: string | null;
  packageRegistry: "npm" | "pypi" | null;
  npmDownloads7d: number | null;
  pypiDownloads7d: number | null;
  /** Sum of npm + pypi downloads (when either is present). */
  downloadsCombined7d: number | null;
  toolCount: number | null;
  p50LatencyMs: number | null;
  uptime7d: number | null;
  /** ISO timestamp of the most recent npm/pypi release. */
  lastReleaseAt: string | null;
  smitheryRank: number | null;
  smitheryTotal: number | null;
  npmDependents: number | null;
  /**
   * Q3 escalation (2026-04-29): absolute snapshots from the publish
   * payload (`metrics.installs_total`, `metrics.stars_total`). Surfaced
   * here so the Weekly DL cell can fall through to them when no per-
   * registry 7d delta or dependents count is available — fixes the
   * day-1 cold-start blackout where every row rendered `—`.
   */
  installsTotal: number | null;
  starsTotal: number | null;
  /**
   * Per-registry source tags from the merger's `raw.sources` array. Each
   * entry is one of "official" (Anthropic), "smithery", "glama",
   * "pulsemcp", "awesome-mcp" — matches `McpSource` in the worker's
   * `apps/trendingrepo-worker/src/lib/mcp/types.ts`. Populated by
   * `buildMcpDisplayFields` from the upstream merge record. Empty array
   * when the publish payload didn't include the source list (legacy
   * payloads pre-dating the merger's `sources` field).
   */
  sources: string[];
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
  /**
   * MCP-only display fields. Populated by `coerceMcpItem` from the same
   * side-channel data the scorer uses (downloads, liveness, smithery rank,
   * dependents). Surfaced for the /mcp leaderboard table without re-doing
   * the side-channel lookups.
   */
  mcp?: McpDisplayFields;
  /**
   * Skill-only ancillary signals surfaced on the /skills page columns.
   * All optional — undefined when the upstream signal isn't populated.
   * The scorer drops missing terms via weight renormalization.
   */
  forks?: number;
  forks7dAgo?: number;
  forkVelocity7d?: number;
  installs7d?: number;
  installsPrev7d?: number;
  installsDelta7d?: number;
  derivativeRepoCount?: number;
  derivativeSampledAt?: string | null;
  derivativeSources?: string[];
  commitVelocity30d?: number;
  lastPushedAt?: string | null;
  createdAt?: string | null;
  lastRefreshedAt?: string | null;
  /** Pre-cross-domain rawScore (0-100) emitted by the domain scorer. */
  hotness?: number;
  /**
   * 7-day-old `hotness` snapshot for this id, populated from the
   * `hotness-snapshot:<domain>:<7d-ago>` Redis key (worker fetcher
   * `hotness-snapshot`). Undefined during the first 7 days of the rolling
   * window or when the snapshot key is missing — UI sort rules fall back to
   * absolute `hotness` in that case.
   */
  hotnessPrev7d?: number;
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
// Chunk C side-channels (worker fetchers in apps/trendingrepo-worker/src/fetchers/)
const MCP_DOWNLOADS_KEY = "mcp-downloads";
const MCP_DOWNLOADS_PYPI_KEY = "mcp-downloads-pypi";
const MCP_DEPENDENTS_KEY = "mcp-dependents";
const MCP_SMITHERY_RANK_KEY = "mcp-smithery-rank";
const SKILL_DERIVATIVES_KEY = "skill-derivative-count";
const SKILL_INSTALL_SNAPSHOT_PREFIX = "skill-install-snapshot";
const SKILL_FORKS_SNAPSHOT_PREFIX = "skill-forks-snapshot";
const HOTNESS_SNAPSHOT_PREFIX = "hotness-snapshot";

/**
 * Domain keys used by the hotness-snapshot worker fetcher. Match the
 * published leaderboard keys 1:1 — the snapshot for /skills reads against
 * both skill domains and merges them; the snapshot for /mcp reads
 * `trending-mcp` only.
 */
type HotnessSnapshotDomain = "trending-skill" | "trending-skill-sh" | "trending-mcp";

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

/**
 * Aggregated MCP side-channel data, threaded through coerceMcpBoard ->
 * coerceMcpItem -> buildMcpItem so the scorer's optional-input fields
 * (npmDownloads7d, pypiDownloads7d, smitheryRank, npmDependents,
 * lastReleaseAt) get populated when the corresponding worker fetcher has
 * snapshotted them. All fields default to `{}` so cold-start behavior is
 * unchanged.
 */
interface McpSideChannels {
  livenessSummary: Record<string, McpLivenessSummaryEntry>;
  downloadsSummary: Record<string, McpDownloadsEntry>;
  dependentsSummary: Record<string, number>;
  smitheryRankSummary: Record<string, McpSmitheryRankEntry>;
  /**
   * 7-day-old hotness snapshot keyed by lowercased item id, sourced from
   * `hotness-snapshot:trending-mcp:<7d-ago>`. Absence → fall back to
   * absolute hotness in the UI.
   */
  hotnessPrev7d: Record<string, number>;
}

interface SkillDerivativeMeta {
  count: number;
  sampledAt?: string;
  sources?: string[];
}

interface SkillSideChannels {
  awesomeIndex: Record<string, string[]>;
  derivatives: Record<string, number>;
  derivativesMeta: Record<string, SkillDerivativeMeta>;
  installsPrev7d: Record<string, number>;
  forksPrev7d: Record<string, number>;
  /**
   * Merged 7-day-old hotness snapshot keyed by lowercased item id, sourced
   * from `hotness-snapshot:trending-skill:<7d-ago>` and
   * `hotness-snapshot:trending-skill-sh:<7d-ago>`. First-write-wins on
   * collision; absence → fall back to absolute hotness in the UI.
   */
  hotnessPrev7d: Record<string, number>;
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

// ---------------------------------------------------------------------------
// Chunk C side-channel signals (populated by worker fetchers)
// ---------------------------------------------------------------------------

interface McpDownloadsEntry {
  npm7d?: number;
  pypi7d?: number;
  lastReleaseAt?: string;
  packageName?: string;
}

interface McpSmitheryRankEntry {
  rank?: number;
  total?: number;
}

async function loadMcpDownloadsSummary(): Promise<Record<string, McpDownloadsEntry>> {
  const store = getDataStore();
  const [npm, pypi] = await Promise.all([
    store.read<unknown>(MCP_DOWNLOADS_KEY),
    store.read<unknown>(MCP_DOWNLOADS_PYPI_KEY),
  ]);
  const out: Record<string, McpDownloadsEntry> = {};
  const npmObj = asRecord(asRecord(npm.data)?.summary);
  if (npmObj) {
    for (const [slug, raw] of Object.entries(npmObj)) {
      const e = asRecord(raw);
      if (!e) continue;
      const entry: McpDownloadsEntry = {};
      const n7 = asNumber(e.npm7d);
      if (n7 !== null) entry.npm7d = n7;
      const lr = asString(e.lastReleaseAt);
      if (lr) entry.lastReleaseAt = lr;
      const pn = asString(e.packageName);
      if (pn) entry.packageName = pn;
      out[slug.toLowerCase()] = entry;
    }
  }
  const pypiObj = asRecord(asRecord(pypi.data)?.summary);
  if (pypiObj) {
    for (const [slug, raw] of Object.entries(pypiObj)) {
      const e = asRecord(raw);
      if (!e) continue;
      const p7 = asNumber(e.pypi7d);
      if (p7 === null) continue;
      const key = slug.toLowerCase();
      out[key] = { ...(out[key] ?? {}), pypi7d: p7 };
    }
  }
  return out;
}

async function loadMcpDependentsSummary(): Promise<Record<string, number>> {
  const store = getDataStore();
  const result = await store.read<unknown>(MCP_DEPENDENTS_KEY);
  const obj = asRecord(asRecord(result.data)?.summary);
  if (!obj) return {};
  const out: Record<string, number> = {};
  for (const [slug, raw] of Object.entries(obj)) {
    const e = asRecord(raw);
    const c = asNumber(e?.count);
    if (c === null) continue;
    out[slug.toLowerCase()] = c;
  }
  return out;
}

async function loadMcpSmitheryRankSummary(): Promise<Record<string, McpSmitheryRankEntry>> {
  const store = getDataStore();
  const result = await store.read<unknown>(MCP_SMITHERY_RANK_KEY);
  const root = asRecord(result.data);
  const obj = asRecord(root?.summary);
  if (!obj) return {};
  const fallbackTotal = asNumber(root?.total) ?? undefined;
  const out: Record<string, McpSmitheryRankEntry> = {};
  for (const [slug, raw] of Object.entries(obj)) {
    const e = asRecord(raw);
    if (!e) continue;
    const rank = asNumber(e.rank);
    const total = asNumber(e.total) ?? fallbackTotal;
    if (rank === null || total === null || total === undefined || total <= 0) continue;
    out[slug.toLowerCase()] = { rank, total };
  }
  return out;
}

async function loadSkillDerivatives(): Promise<{
  counts: Record<string, number>;
  meta: Record<string, SkillDerivativeMeta>;
}> {
  if (legacyScoringEnabled()) return { counts: {}, meta: {} };
  const store = getDataStore();
  const result = await store.read<unknown>(SKILL_DERIVATIVES_KEY);
  const obj = asRecord(asRecord(result.data)?.summary);
  if (!obj) return { counts: {}, meta: {} };
  const counts: Record<string, number> = {};
  const meta: Record<string, SkillDerivativeMeta> = {};
  for (const [slug, raw] of Object.entries(obj)) {
    const e = asRecord(raw);
    const c = asNumber(e?.count);
    if (c === null) continue;
    const key = slug.toLowerCase();
    counts[key] = c;
    const sampledAt = asString(e?.sampledAt) ?? undefined;
    const sourcesRaw = e?.sources;
    const sources = Array.isArray(sourcesRaw)
      ? sourcesRaw
          .map((s) => asString(s))
          .filter((s): s is string => Boolean(s))
      : undefined;
    meta[key] = { count: c, sampledAt, sources };
  }
  return { counts, meta };
}

async function loadSkillInstallsPrev7d(): Promise<Record<string, number>> {
  if (legacyScoringEnabled()) return {};
  // 7-day-old snapshot. When the snapshot key isn't present yet (first 7
  // days of the rolling window) we return an empty map and the scorer drops
  // installsDelta7d via existing renormalization.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const dateKey = d.toISOString().slice(0, 10);
  const store = getDataStore();
  const result = await store.read<unknown>(`${SKILL_INSTALL_SNAPSHOT_PREFIX}:${dateKey}`);
  const installs = asRecord(asRecord(result.data)?.installs);
  if (!installs) return {};
  const out: Record<string, number> = {};
  for (const [slug, raw] of Object.entries(installs)) {
    const v = asNumber(raw);
    if (v === null) continue;
    out[slug.toLowerCase()] = v;
  }
  return out;
}

async function loadSkillForksPrev7d(): Promise<Record<string, number>> {
  if (legacyScoringEnabled()) return {};
  // 7-day-old snapshot. When the snapshot key isn't present yet (first 7
  // days of the rolling window) we return an empty map and the scorer drops
  // forkVelocity7d via existing renormalization.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const dateKey = d.toISOString().slice(0, 10);
  const store = getDataStore();
  const result = await store.read<unknown>(`${SKILL_FORKS_SNAPSHOT_PREFIX}:${dateKey}`);
  const forks = asRecord(asRecord(result.data)?.forks);
  if (!forks) return {};
  const out: Record<string, number> = {};
  for (const [slug, raw] of Object.entries(forks)) {
    const v = asNumber(raw);
    if (v === null) continue;
    out[slug.toLowerCase()] = v;
  }
  return out;
}

/**
 * Load the 7-day-old hotness snapshot for a single domain. Returns
 * `Record<id, number>` with all keys lowercased. Empty map during the
 * cold-start window (first 7 days after the worker fetcher ships) or
 * whenever the snapshot key is missing — callers must treat the absence
 * as "no prior" and fall back to absolute hotness.
 *
 * Gated by `legacyScoringEnabled()` so the rollback flag also strips the
 * velocity ordering.
 */
export async function loadHotnessPrev7d(
  domain: HotnessSnapshotDomain,
): Promise<Record<string, number>> {
  if (legacyScoringEnabled()) return {};
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const dateKey = d.toISOString().slice(0, 10);
  const store = getDataStore();
  const result = await store.read<unknown>(
    `${HOTNESS_SNAPSHOT_PREFIX}:${domain}:${dateKey}`,
  );
  const scores = asRecord(asRecord(result.data)?.scores);
  if (!scores) return {};
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(scores)) {
    const v = asNumber(raw);
    if (v === null) continue;
    out[id.toLowerCase()] = v;
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
  const [
    skillsShRaw,
    githubRaw,
    awesomeIndex,
    derivativeBundle,
    installsPrev7d,
    forksPrev7d,
    hotnessPrevSkill,
    hotnessPrevSkillsSh,
  ] = await Promise.all([
    store.read<unknown>(SKILLS_SH_KEY),
    store.read<unknown>(GITHUB_SKILLS_KEY),
    loadAwesomeSkillsIndex(),
    loadSkillDerivatives(),
    loadSkillInstallsPrev7d(),
    loadSkillForksPrev7d(),
    loadHotnessPrev7d("trending-skill"),
    loadHotnessPrev7d("trending-skill-sh"),
  ]);
  // Merge both skill-domain snapshots into one map. First-write-wins on id
  // collision (same id present in both feeds is rare; either snapshot is
  // representative for the purpose of velocity ordering).
  const hotnessPrev7d: Record<string, number> = { ...hotnessPrevSkillsSh };
  for (const [k, v] of Object.entries(hotnessPrevSkill)) {
    if (hotnessPrev7d[k] === undefined) hotnessPrev7d[k] = v;
  }
  const sideChannels: SkillSideChannels = {
    awesomeIndex,
    derivatives: derivativeBundle.counts,
    derivativesMeta: derivativeBundle.meta,
    installsPrev7d,
    forksPrev7d,
    hotnessPrev7d,
  };
  const skillsSh = coerceSkillsShBoard(skillsShRaw, sideChannels);
  const github = coerceGithubSkillsBoard(githubRaw, sideChannels);
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
  const [
    raw,
    livenessSummary,
    downloadsSummary,
    dependentsSummary,
    smitheryRankSummary,
    hotnessPrev7d,
  ] = await Promise.all([
    store.read<unknown>(MCP_KEY),
    loadMcpLivenessSummary(),
    loadMcpDownloadsSummary(),
    loadMcpDependentsSummary(),
    loadMcpSmitheryRankSummary(),
    loadHotnessPrev7d("trending-mcp"),
  ]);
  const sideChannels: McpSideChannels = {
    livenessSummary,
    downloadsSummary,
    dependentsSummary,
    smitheryRankSummary,
    hotnessPrev7d,
  };
  const board = coerceMcpBoard(raw, sideChannels);
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
    const resolvedLogo =
      board.kind === "mcp"
        ? mcpEntityLogoUrl(item, 40)
        : item.logoUrl ?? repoAvatar ?? urlFavicon;
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
  sideChannels: SkillSideChannels = emptySkillSideChannels(),
): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt = asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const pairs = rows
    .map((item, idx) => coerceSkillsShItem(item, idx + 1, fetchedAt))
    .filter((p): p is { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } => p !== null);
  const items = applySkillMomentum(pairs, sideChannels);
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
  sideChannels: SkillSideChannels = emptySkillSideChannels(),
): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt = asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const pairs = rows
    .map((item, idx) => coerceGithubSkillItem(item, idx + 1))
    .filter((p): p is { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } => p !== null);
  const items = applySkillMomentum(pairs, sideChannels);
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
  sideChannels: McpSideChannels = emptyMcpSideChannels(),
): EcosystemBoard {
  const obj = asRecord(result.data);
  const fetchedAt =
    asString(obj?.generatedAt) ?? asString(obj?.fetchedAt) ?? result.writtenAt ?? null;
  const rows = Array.isArray(obj?.items) ? obj.items : [];
  const pairs = rows
    .map((item, idx) => coerceMcpItem(item, idx + 1, fetchedAt, sideChannels))
    .filter((p): p is { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } => p !== null);
  const items = applyMcpMomentum(pairs, sideChannels);

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
      // Resolve the GitHub owner avatar from the linked repo when present;
      // fall back to a favicon derived from the entry's URL host. Skills.sh
      // doesn't ship logo_url, so this is what makes /skills render avatars
      // instead of blank monogram tiles.
      logoUrl:
        repoLogoUrl(linkedRepo, 80) ?? resolveLogoUrl(url, skillName, 64),
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
      // Always derivable here — `fullName` is always "owner/repo" for the
      // GitHub topic feed, so the GitHub owner avatar is the right logo.
      logoUrl: repoLogoUrl(fullName, 80),
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
  sideChannels: McpSideChannels = emptyMcpSideChannels(),
): { item: EcosystemLeaderboardItem; raw: Record<string, unknown> } | null {
  const livenessSummary = sideChannels.livenessSummary;
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
  // Stash all matched side-channels under __sideChannels so buildMcpItem can
  // pluck them by slug-or-id without re-doing the lookup. `__liveness` is
  // kept as a top-level key for backward compat with existing tests.
  const lookupKeys = [livenessKey, slug, id]
    .filter((k): k is string => Boolean(k))
    .map((k) => k.toLowerCase());
  // SCORING_USE_LEGACY=1 → drop the new wave's side-channels so the MCP
  // scorer renormalizes back to the pre-wave subset of weights.
  const legacy = legacyScoringEnabled();
  const downloadsEntry = legacy
    ? undefined
    : pickByKeys(sideChannels.downloadsSummary, lookupKeys);
  const dependentsCount = legacy
    ? undefined
    : pickByKeys(sideChannels.dependentsSummary, lookupKeys);
  const smitheryRankEntry = legacy
    ? undefined
    : pickByKeys(sideChannels.smitheryRankSummary, lookupKeys);
  const enrichedRaw: Record<string, unknown> = {
    ...item,
    ...(livenessEntry ? { __liveness: livenessEntry } : {}),
    ...(downloadsEntry ? { __downloads: downloadsEntry } : {}),
    ...(dependentsCount !== undefined ? { __dependents: dependentsCount } : {}),
    ...(smitheryRankEntry ? { __smitheryRank: smitheryRankEntry } : {}),
  };

  // UI-shaped mirror of the same side-channel data. Lets the /mcp page
  // render columns without re-doing the lookups. Kept separate from
  // buildMcpItem (the scorer-input mapper) per chunk ownership.
  const mcpDisplay = buildMcpDisplayFields({
    raw: item,
    metrics,
    livenessEntry,
    downloadsEntry,
    dependentsCount,
    smitheryRankEntry,
  });

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
      mcp: mcpDisplay,
    },
    raw: enrichedRaw,
  };
}

/**
 * Build the per-row `McpDisplayFields` block. Mirrors buildMcpItem's
 * side-channel reads in UI shape. Kept separate so buildMcpItem (the
 * scorer-input mapper, owned by the scoring chunk) stays untouched.
 */
function buildMcpDisplayFields(args: {
  raw: Record<string, unknown>;
  metrics: Record<string, unknown> | null;
  livenessEntry: McpLivenessSummaryEntry | undefined;
  downloadsEntry: McpDownloadsEntry | undefined;
  dependentsCount: number | undefined;
  smitheryRankEntry: McpSmitheryRankEntry | undefined;
}): McpDisplayFields {
  const { raw, metrics, livenessEntry, downloadsEntry, dependentsCount, smitheryRankEntry } = args;

  const npm7d = downloadsEntry?.npm7d ?? null;
  const pypi7d = downloadsEntry?.pypi7d ?? null;
  // Cold-start fallback: if neither side-channel has download data, use the
  // publish payload's metrics.downloads_7d as a combined number (matches the
  // scorer's behaviour). Goes into combined only — per-registry fields stay
  // null so the UI doesn't claim provenance it doesn't have.
  const fallbackDownloads = asNumber(metrics?.downloads_7d);
  const combined =
    npm7d !== null || pypi7d !== null
      ? (npm7d ?? 0) + (pypi7d ?? 0)
      : fallbackDownloads;

  const explicitTransport = asString(raw.transport)?.toLowerCase() ?? null;
  const transport: McpDisplayFields["transport"] =
    explicitTransport === "http" ||
    explicitTransport === "sse" ||
    explicitTransport === "streamable-http" ||
    explicitTransport === "stdio"
      ? (explicitTransport as McpDisplayFields["transport"])
      : null;

  const isStdio = livenessEntry?.isStdio === true || transport === "stdio";

  // packageName: prefer the side-channel (which knows the registry it came
  // from), else fall back to top-level raw.package_name on the publish
  // payload (some upstream registry clients populate this).
  let packageName: string | null = downloadsEntry?.packageName ?? null;
  let packageRegistry: McpDisplayFields["packageRegistry"] = null;
  if (packageName) {
    packageRegistry = npm7d !== null ? "npm" : pypi7d !== null ? "pypi" : null;
  } else {
    const rawPkg = asString(raw.package_name);
    if (rawPkg) {
      packageName = rawPkg;
      const reg = asString(raw.package_registry)?.toLowerCase();
      packageRegistry = reg === "npm" ? "npm" : reg === "pypi" ? "pypi" : null;
    }
  }

  // Per-registry source tags. The merger writes `raw.sources` as an array
  // like ["official", "smithery", "glama"]. Some publish payloads carry it
  // at the top level; older snapshots don't, in which case we leave it []
  // and the UI falls back to the `crossSourceCount` digit + `verified` bit.
  const rawSources = Array.isArray(raw.sources)
    ? (raw.sources as unknown[])
        .map((s) => asString(s)?.toLowerCase())
        .filter((s): s is string => Boolean(s))
    : [];

  // Q3 escalation: surface absolute snapshots so the Weekly DL cell can
  // gracefully fall back when no per-registry 7d delta is available.
  const installsTotal = asNumber(metrics?.installs_total) ?? null;
  const starsTotal = asNumber(metrics?.stars_total) ?? null;

  return {
    transport,
    isStdio,
    packageName,
    packageRegistry,
    npmDownloads7d: npm7d,
    pypiDownloads7d: pypi7d,
    downloadsCombined7d: combined !== null ? combined : null,
    toolCount: livenessEntry?.toolCount ?? null,
    p50LatencyMs: livenessEntry?.p50LatencyMs ?? null,
    uptime7d: livenessEntry?.uptime7d ?? null,
    lastReleaseAt: downloadsEntry?.lastReleaseAt ?? null,
    smitheryRank: smitheryRankEntry?.rank ?? null,
    smitheryTotal: smitheryRankEntry?.total ?? null,
    npmDependents: dependentsCount ?? null,
    installsTotal,
    starsTotal,
    sources: rawSources,
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
  sideChannels: SkillSideChannels = emptySkillSideChannels(),
): EcosystemLeaderboardItem[] {
  if (pairs.length === 0) return [];
  const skillItems: SkillItem[] = pairs.map(({ item, raw }) =>
    buildSkillItem(item, raw, sideChannels),
  );
  const scored = skillScorer.computeRaw(skillItems);
  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["skill", scored as unknown as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("skill") ?? [];
  // ranked preserves input order — splice momentum back in by index.
  return pairs.map((p, i) => {
    const r = ranked[i];
    const skillItem = skillItems[i];
    const scoredItem = scored[i];
    const rawForks = skillItem?.forks;
    const rawForks7dAgo = skillItem?.forks7dAgo;
    const forkVelocity7d =
      rawForks !== undefined && rawForks7dAgo !== undefined
        ? rawForks - rawForks7dAgo
        : undefined;
    const installs7d = skillItem?.installs7d;
    const installsPrev7d = skillItem?.installsPrev7d;
    const installsDelta7d =
      installs7d !== undefined && installsPrev7d !== undefined
        ? installs7d - installsPrev7d
        : undefined;
    const linkedRepoLower = p.item.linkedRepo?.toLowerCase() ?? null;
    const slugCandidates = [
      asString(p.raw.slug),
      asString(p.raw.full_name),
      p.item.id,
      linkedRepoLower,
    ]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase());
    const derivativeMeta = pickByKeys(sideChannels.derivativesMeta, slugCandidates);
    const hotnessPrev7d = pickByKeys(sideChannels.hotnessPrev7d, slugCandidates);
    const createdAt =
      asString(p.raw.created_at) ?? asString(p.raw.createdAt) ?? null;
    const lastRefreshedAt = asString(p.raw.lastRefreshedAt) ?? null;
    const momentum = r ? Math.round(r.momentum) : 0;
    return {
      ...p.item,
      signalScore: Math.max(1, Math.min(100, momentum)),
      rank: p.item.rank || i + 1,
      forks: rawForks,
      forks7dAgo: rawForks7dAgo,
      forkVelocity7d,
      installs7d,
      installsPrev7d,
      installsDelta7d,
      derivativeRepoCount: skillItem?.derivativeRepoCount,
      derivativeSampledAt: derivativeMeta?.sampledAt ?? null,
      derivativeSources: derivativeMeta?.sources,
      commitVelocity30d: skillItem?.commitVelocity30d,
      lastPushedAt: skillItem?.lastPushedAt ?? null,
      createdAt,
      lastRefreshedAt,
      hotness: scoredItem ? Math.round(scoredItem.rawScore) : undefined,
      hotnessPrev7d,
    };
  });
}

function applyMcpMomentum(
  pairs: Array<{ item: EcosystemLeaderboardItem; raw: Record<string, unknown> }>,
  sideChannels: McpSideChannels = emptyMcpSideChannels(),
): EcosystemLeaderboardItem[] {
  if (pairs.length === 0) return [];
  // Most side-channel lookups already happened in coerceMcpItem; the data is
  // stashed under raw.__downloads / __dependents / __smitheryRank /
  // __liveness. buildMcpItem reads those. The hotness-snapshot lookup,
  // however, happens HERE so we can join against the post-scoring item id
  // without re-coercing the row.
  const mcpItems: McpItem[] = pairs.map(({ item, raw }) => buildMcpItem(item, raw));
  const scored = mcpScorer.computeRaw(mcpItems);
  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["mcp", scored as unknown as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("mcp") ?? [];
  return pairs.map((p, i) => {
    const r = ranked[i];
    const scoredItem = scored[i];
    const momentum = r ? Math.round(r.momentum) : 0;
    const linkedRepoLower = p.item.linkedRepo?.toLowerCase() ?? null;
    const slugCandidates = [
      asString(p.raw.slug),
      asString(p.raw.id),
      p.item.id,
      linkedRepoLower,
    ]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase());
    const hotnessPrev7d = pickByKeys(sideChannels.hotnessPrev7d, slugCandidates);
    return {
      ...p.item,
      signalScore: Math.max(1, Math.min(100, momentum)),
      rank: p.item.rank || i + 1,
      hotness: scoredItem ? Math.round(scoredItem.rawScore) : undefined,
      hotnessPrev7d,
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
  sideChannels: SkillSideChannels = emptySkillSideChannels(),
): SkillItem {
  const installs7d = asNumber(raw.installs); // skills.sh
  const installs7dAlt = asNumber(raw.installs7d);
  const installsCurrent = installs7d ?? installs7dAlt ?? null;
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
    linkedRepoLower && sideChannels.awesomeIndex[linkedRepoLower]
      ? sideChannels.awesomeIndex[linkedRepoLower]
      : undefined;

  // Chunk C side-channel lookups: skill-derivative-count + skill-install-snapshot
  // both index by skill slug (lowercased). Try the explicit slug first, then
  // fall back to id and full_name.
  const slugCandidates = [
    asString(raw.slug),
    asString(raw.full_name),
    item.id,
    linkedRepoLower,
  ]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase());
  const installsPrev = pickByKeys(sideChannels.installsPrev7d, slugCandidates);
  const forksPrev = pickByKeys(sideChannels.forksPrev7d, slugCandidates);
  const derivativeRepoCount = pickByKeys(sideChannels.derivatives, slugCandidates);
  // commitVelocity30d returns to its real meaning now that derivativeRepoCount
  // is its own scorer input. Falls back to undefined (scorer treats as 0).
  const commitVelocity30d =
    asNumber(raw.commit_velocity_30d) ??
    asNumber(raw.commitVelocity30d) ??
    undefined;

  return {
    domainKey: "skill",
    id: item.id,
    joinKeys: { repoFullName: item.linkedRepo ?? undefined },
    installs7d: installsCurrent !== null ? installsCurrent : undefined,
    installsPrev7d: installsPrev,
    stars: stars !== null ? stars : undefined,
    forks: forks !== null ? forks : undefined,
    forks7dAgo: forksPrev,
    agents: item.agents,
    inAwesomeLists,
    commitVelocity30d,
    derivativeRepoCount,
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
  const fallbackDownloads7d = asNumber(metrics?.downloads_7d);

  // Side-channel reads. coerceMcpItem stashed these on raw under __-prefixed
  // keys when the corresponding worker fetcher (npm-downloads, pypi-downloads,
  // npm-dependents, mcp-smithery-rank) had data for this slug. All optional —
  // the scorer drops missing terms via existing renormalization.
  const liveness = asRecord(raw.__liveness);
  const downloads = asRecord(raw.__downloads);
  const dependentsCount = asNumber(raw.__dependents);
  const smitheryRank = asRecord(raw.__smitheryRank);

  const npmDownloads7d =
    downloads ? asNumber(downloads.npm7d) ?? undefined : undefined;
  const pypiDownloads7d =
    downloads ? asNumber(downloads.pypi7d) ?? undefined : undefined;
  const lastReleaseAt =
    downloads ? asString(downloads.lastReleaseAt) ?? undefined : undefined;
  // Cold-start fallback: if neither side-channel has download data, fall
  // back to the publish payload's `metrics.downloads_7d` (combined) the same
  // way the previous implementation did.
  const npmDownloadsResolved =
    npmDownloads7d !== undefined
      ? npmDownloads7d
      : pypiDownloads7d === undefined && fallbackDownloads7d !== null
        ? fallbackDownloads7d
        : undefined;

  const npmName = item.linkedRepo
    ? leafName(item.linkedRepo) ?? undefined
    : undefined;

  // Q3+Q4 escalation (2026-04-29): pass through absolute snapshots from the
  // publish payload so the scorer can fall back to `installsAbs` / `starsAbs`
  // during the day-1 cold-start window when no 7d-ago snapshot exists yet.
  const installsTotalAbs = asNumber(metrics?.installs_total) ?? undefined;
  const starsTotalAbs = asNumber(metrics?.stars_total) ?? undefined;

  return {
    domainKey: "mcp",
    id: item.id,
    joinKeys: { npmName, repoFullName: item.linkedRepo ?? undefined },
    npmDownloads7d: npmDownloadsResolved,
    pypiDownloads7d,
    livenessUptime7d: liveness ? asNumber(liveness.uptime7d) ?? undefined : undefined,
    livenessInferred: liveness ? asBoolean(liveness.livenessInferred) : false,
    toolCount: liveness ? asNumber(liveness.toolCount) ?? undefined : undefined,
    smitheryRank: smitheryRank ? asNumber(smitheryRank.rank) ?? undefined : undefined,
    smitheryTotal: smitheryRank ? asNumber(smitheryRank.total) ?? undefined : undefined,
    npmDependents: dependentsCount !== null ? dependentsCount : undefined,
    crossSourceCount: item.crossSourceCount,
    p50LatencyMs: liveness ? asNumber(liveness.p50LatencyMs) ?? undefined : undefined,
    isStdio: liveness ? asBoolean(liveness.isStdio) : false,
    lastReleaseAt,
    installsTotal: installsTotalAbs,
    stars: starsTotalAbs,
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

function pickByKeys<T>(map: Record<string, T>, keys: ReadonlyArray<string>): T | undefined {
  for (const k of keys) {
    if (k && Object.prototype.hasOwnProperty.call(map, k)) return map[k];
  }
  return undefined;
}

function emptyMcpSideChannels(): McpSideChannels {
  return {
    livenessSummary: {},
    downloadsSummary: {},
    dependentsSummary: {},
    smitheryRankSummary: {},
    hotnessPrev7d: {},
  };
}

function emptySkillSideChannels(): SkillSideChannels {
  return {
    awesomeIndex: {},
    derivatives: {},
    derivativesMeta: {},
    installsPrev7d: {},
    forksPrev7d: {},
    hotnessPrev7d: {},
  };
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
