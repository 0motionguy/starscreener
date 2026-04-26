import type { Repo } from "@/lib/types";

export type DataApiWindow = "24h" | "7d" | "30d";
export type DataApiSort = "trend" | "momentum" | "stars" | "delta" | "newest";
export type DataApiFilter =
  | "all"
  | "breakouts"
  | "hot"
  | "quiet-killers"
  | "new-under-30d";

export const DATA_API_DEFAULT_LIMIT = 100;
export const DATA_API_MAX_LIMIT = 500;

const DATA_API_WINDOWS = new Set<DataApiWindow>(["24h", "7d", "30d"]);
const DATA_API_SORTS = new Set<DataApiSort>([
  "trend",
  "momentum",
  "stars",
  "delta",
  "newest",
]);
const DATA_API_FILTERS = new Set<DataApiFilter>([
  "all",
  "breakouts",
  "hot",
  "quiet-killers",
  "new-under-30d",
]);

const DATA_API_FIELDS = [
  "id",
  "fullName",
  "owner",
  "name",
  "description",
  "url",
  "language",
  "topics",
  "tags",
  "categoryId",
  "stars",
  "forks",
  "contributors",
  "openIssues",
  "starsDelta24h",
  "starsDelta7d",
  "starsDelta30d",
  "momentumScore",
  "movementStatus",
  "rank",
  "createdAt",
  "lastCommitAt",
  "lastReleaseAt",
  "lastReleaseTag",
  "ownerAvatarUrl",
  "collectionNames",
  "crossSignalScore",
  "channelsFiring",
] as const;

export type DataApiField = (typeof DATA_API_FIELDS)[number];
export type DataApiRepoRow = Partial<Pick<Repo, DataApiField>>;

const FIELD_SET = new Set<string>(DATA_API_FIELDS);
const DEFAULT_FIELDS: DataApiField[] = [
  "fullName",
  "description",
  "url",
  "language",
  "categoryId",
  "stars",
  "starsDelta24h",
  "starsDelta7d",
  "starsDelta30d",
  "momentumScore",
  "movementStatus",
  "rank",
];

export class DataApiQueryError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "DataApiQueryError";
    this.status = 400;
    this.code = code;
    this.details = details;
  }
}

export interface BuildDataReposOptions {
  repos: Repo[];
  now?: string;
}

export interface DataReposResponse {
  ok: true;
  v: 1;
  fetchedAt: string;
  data: DataApiRepoRow[];
  meta: {
    total: number;
    count: number;
    limit: number;
    offset: number;
    nextOffset: number | null;
    window: DataApiWindow;
    sort: DataApiSort;
    filter: DataApiFilter;
    fields: DataApiField[];
  };
}

export interface DataSnapshotResponse {
  ok: true;
  v: 1;
  fetchedAt: string;
  summary: {
    totalRepos: number;
    totalStars: number;
    byLanguage: Record<string, number>;
    byCategory: Record<string, number>;
    byMovementStatus: Record<string, number>;
  };
  topRepos: Array<Pick<Repo, "fullName" | "stars" | "starsDelta24h" | "starsDelta7d" | "starsDelta30d" | "momentumScore" | "movementStatus">>;
}

export interface BuildDataSnapshotOptions {
  repos: Repo[];
  now?: string;
  topLimit?: number;
}

function parseEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: Set<T>,
  fallback: T,
  code: string,
): T {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  if (!allowed.has(raw as T)) {
    throw new DataApiQueryError(
      `${key} must be one of: ${Array.from(allowed).join(", ")}`,
      code,
      { allowed: Array.from(allowed), received: raw },
    );
  }
  return raw as T;
}

function parseNonNegativeInt(
  params: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new DataApiQueryError(`${key} must be a non-negative integer`, "BAD_QUERY");
  }
  return Math.floor(parsed);
}

function parseLimit(params: URLSearchParams): number {
  const raw = params.get("limit");
  if (raw === null || raw.trim() === "") return DATA_API_DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new DataApiQueryError("limit must be a positive integer", "BAD_QUERY");
  }
  return Math.min(Math.floor(parsed), DATA_API_MAX_LIMIT);
}

function parseFields(params: URLSearchParams): DataApiField[] {
  const raw = params.get("fields");
  if (raw === null || raw.trim() === "") return DEFAULT_FIELDS;
  const requested = raw
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  if (requested.length === 0) {
    throw new DataApiQueryError("fields must include at least one field", "BAD_FIELD");
  }
  const unknown = requested.filter((field) => !FIELD_SET.has(field));
  if (unknown.length > 0) {
    throw new DataApiQueryError("unknown data fields", "BAD_FIELD", {
      unknown,
      allowed: DATA_API_FIELDS,
    });
  }
  return Array.from(new Set(requested)) as DataApiField[];
}

function deltaForWindow(repo: Repo, window: DataApiWindow): number {
  switch (window) {
    case "24h":
      return repo.starsDelta24h;
    case "7d":
      return repo.starsDelta7d;
    case "30d":
      return repo.starsDelta30d;
  }
}

function trendScore(repo: Repo, window: DataApiWindow): number {
  switch (window) {
    case "24h":
      return repo.trendScore24h ?? repo.starsDelta24h;
    case "7d":
      return repo.trendScore7d ?? repo.starsDelta7d;
    case "30d":
      return repo.trendScore30d ?? repo.starsDelta30d;
  }
}

function applyFilter(repos: Repo[], filter: DataApiFilter, nowMs: number): Repo[] {
  switch (filter) {
    case "all":
      return repos;
    case "breakouts":
      return repos.filter((repo) => repo.movementStatus === "breakout");
    case "hot":
      return repos.filter((repo) => repo.movementStatus === "hot");
    case "quiet-killers":
      return repos.filter((repo) => repo.movementStatus === "quiet_killer");
    case "new-under-30d":
      return repos.filter((repo) => {
        const created = Date.parse(repo.createdAt);
        return Number.isFinite(created) && nowMs - created < 30 * 86_400_000;
      });
  }
}

function applySearchFilters(repos: Repo[], params: URLSearchParams): Repo[] {
  let out = repos;
  const category = params.get("category")?.trim();
  if (category) out = out.filter((repo) => repo.categoryId === category);

  const language = params.get("language")?.trim().toLowerCase();
  if (language) {
    out = out.filter((repo) => repo.language?.toLowerCase() === language);
  }

  const tag = (params.get("tag") ?? params.get("topic"))?.trim().toLowerCase();
  if (tag) {
    out = out.filter((repo) => {
      const tags = repo.tags ?? [];
      const topics = repo.topics ?? [];
      return [...tags, ...topics].some((item) => item.toLowerCase() === tag);
    });
  }

  const q = params.get("q")?.trim().toLowerCase();
  if (q) {
    out = out.filter((repo) =>
      [
        repo.fullName,
        repo.description,
        repo.language ?? "",
        ...(repo.topics ?? []),
        ...(repo.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  return out;
}

function sortRepos(repos: Repo[], sort: DataApiSort, window: DataApiWindow): Repo[] {
  const out = [...repos];
  out.sort((a, b) => {
    switch (sort) {
      case "trend": {
        const trend = trendScore(b, window) - trendScore(a, window);
        if (trend !== 0) return trend;
        return b.momentumScore - a.momentumScore;
      }
      case "momentum":
        return b.momentumScore - a.momentumScore;
      case "stars":
        return b.stars - a.stars;
      case "delta":
        return deltaForWindow(b, window) - deltaForWindow(a, window);
      case "newest":
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
  });
  return out;
}

function projectRepo(repo: Repo, fields: DataApiField[]): DataApiRepoRow {
  const row: DataApiRepoRow = {};
  for (const field of fields) {
    row[field] = repo[field] as never;
  }
  return row;
}

function incrementCount(map: Record<string, number>, rawKey: string | null | undefined): void {
  const key = rawKey && rawKey.trim() ? rawKey : "unknown";
  map[key] = (map[key] ?? 0) + 1;
}

function sortCountObject(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function buildDataReposResponse(
  params: URLSearchParams,
  options: BuildDataReposOptions,
): DataReposResponse {
  const now = options.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const window = parseEnum(params, "window", DATA_API_WINDOWS, "7d", "BAD_WINDOW");
  const sort = parseEnum(params, "sort", DATA_API_SORTS, "trend", "BAD_SORT");
  const filter = parseEnum(params, "filter", DATA_API_FILTERS, "all", "BAD_FILTER");
  const limit = parseLimit(params);
  const offset = parseNonNegativeInt(params, "offset", 0);
  const fields = parseFields(params);

  let candidates = applyFilter(options.repos, filter, Number.isFinite(nowMs) ? nowMs : Date.now());
  candidates = applySearchFilters(candidates, params);
  const total = candidates.length;
  const page = sortRepos(candidates, sort, window).slice(offset, offset + limit);
  const nextOffset = offset + page.length < total ? offset + page.length : null;

  return {
    ok: true,
    v: 1,
    fetchedAt: now,
    data: page.map((repo) => projectRepo(repo, fields)),
    meta: {
      total,
      count: page.length,
      limit,
      offset,
      nextOffset,
      window,
      sort,
      filter,
      fields,
    },
  };
}

export function buildDataSnapshotResponse(
  options: BuildDataSnapshotOptions,
): DataSnapshotResponse {
  const now = options.now ?? new Date().toISOString();
  const byLanguage: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byMovementStatus: Record<string, number> = {};
  let totalStars = 0;

  for (const repo of options.repos) {
    totalStars += repo.stars;
    incrementCount(byLanguage, repo.language);
    incrementCount(byCategory, repo.categoryId);
    incrementCount(byMovementStatus, repo.movementStatus);
  }

  const topLimit = Math.min(Math.max(options.topLimit ?? 25, 1), 100);
  const topRepos = sortRepos(options.repos, "momentum", "7d")
    .slice(0, topLimit)
    .map((repo) => ({
      fullName: repo.fullName,
      stars: repo.stars,
      starsDelta24h: repo.starsDelta24h,
      starsDelta7d: repo.starsDelta7d,
      starsDelta30d: repo.starsDelta30d,
      momentumScore: repo.momentumScore,
      movementStatus: repo.movementStatus,
    }));

  return {
    ok: true,
    v: 1,
    fetchedAt: now,
    summary: {
      totalRepos: options.repos.length,
      totalStars,
      byLanguage: sortCountObject(byLanguage),
      byCategory: sortCountObject(byCategory),
      byMovementStatus: sortCountObject(byMovementStatus),
    },
    topRepos,
  };
}

export function dataApiAllowedFields(): readonly DataApiField[] {
  return DATA_API_FIELDS;
}
