import recentReposJson from "../../data/recent-repos.json";
import type { Repo } from "./types";
import { slugToId } from "./utils";

export interface RecentRepoRow {
  githubId: number;
  fullName: string;
  name: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string;
  url: string;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
}

interface RecentReposFile {
  fetchedAt: string | null;
  items: RecentRepoRow[];
}

const data = recentReposJson as unknown as RecentReposFile;

export const recentReposFetchedAt = data.fetchedAt ?? null;

export function getRecentRepos(): RecentRepoRow[] {
  return Array.isArray(data.items) ? data.items : [];
}

export function buildBaseRepoFromRecent(row: RecentRepoRow): Repo {
  return {
    id: slugToId(row.fullName),
    fullName: row.fullName,
    name: row.name,
    owner: row.owner,
    ownerAvatarUrl: row.ownerAvatarUrl,
    description: row.description ?? "",
    url: row.url,
    language: row.language,
    topics: row.topics ?? [],
    categoryId: "other",
    stars: row.stars,
    forks: row.forks,
    contributors: 0,
    openIssues: row.openIssues,
    lastCommitAt: row.pushedAt || row.updatedAt || row.createdAt,
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: row.createdAt,
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    trendScore24h: 0,
    trendScore7d: 0,
    trendScore30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: [],
  };
}
