import type { Repo, SocialPlatform } from "../lib/types";
import type { RepoMention } from "../lib/pipeline/types";

export interface TestUser {
  userId: string;
  username: string;
  email: string;
  role: "user" | "admin";
}

const DEFAULT_TIMESTAMP = "2026-04-20T00:00:00.000Z";

function sanitizeRepoNameForId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function repoIdFromFullName(fullName: string): string {
  const [owner = "acme", name = "repo"] = fullName.split("/");
  return `${owner}--${sanitizeRepoNameForId(name)}`;
}

export function makeRepo(overrides: Partial<Repo> = {}): Repo {
  const fullName = overrides.fullName ?? "acme/widgets";
  const [owner = "acme", name = "widgets"] = fullName.split("/");
  const id = overrides.id ?? repoIdFromFullName(fullName);

  return {
    id,
    fullName,
    name: overrides.name ?? name,
    owner: overrides.owner ?? owner,
    ownerAvatarUrl:
      overrides.ownerAvatarUrl ?? `https://github.com/${owner}.png`,
    description: overrides.description ?? `${fullName} fixture repo`,
    url: overrides.url ?? `https://github.com/${fullName}`,
    language: overrides.language ?? "TypeScript",
    topics: overrides.topics ?? [],
    categoryId: overrides.categoryId ?? "fixture",
    stars: overrides.stars ?? 1000,
    forks: overrides.forks ?? 100,
    contributors: overrides.contributors ?? 10,
    openIssues: overrides.openIssues ?? 5,
    lastCommitAt: overrides.lastCommitAt ?? DEFAULT_TIMESTAMP,
    lastReleaseAt: overrides.lastReleaseAt ?? null,
    lastReleaseTag: overrides.lastReleaseTag ?? null,
    createdAt: overrides.createdAt ?? "2020-01-01T00:00:00.000Z",
    starsDelta24h: overrides.starsDelta24h ?? 1,
    starsDelta7d: overrides.starsDelta7d ?? 7,
    starsDelta30d: overrides.starsDelta30d ?? 30,
    forksDelta7d: overrides.forksDelta7d ?? 1,
    contributorsDelta30d: overrides.contributorsDelta30d ?? 1,
    hasMovementData: overrides.hasMovementData ?? true,
    momentumScore: overrides.momentumScore ?? 50,
    movementStatus: overrides.movementStatus ?? "stable",
    rank: overrides.rank ?? 1,
    categoryRank: overrides.categoryRank ?? 1,
    sparklineData:
      overrides.sparklineData ?? Array.from({ length: 30 }, (_, i) => 1000 + i),
    socialBuzzScore: overrides.socialBuzzScore ?? 0,
    mentionCount24h: overrides.mentionCount24h ?? 0,
    tags: overrides.tags ?? ["fixture"],
    ...overrides,
  };
}

export function makeMention(overrides: Partial<RepoMention> = {}): RepoMention {
  const repoId = overrides.repoId ?? "acme--widgets";
  const platform: SocialPlatform = overrides.platform ?? "hackernews";
  const baseUrl = `https://example.com/${repoId}/mention-1`;
  const url = overrides.url ?? baseUrl;

  return {
    id: overrides.id ?? `${platform}-${repoId}-1`,
    repoId,
    platform,
    author: overrides.author ?? "alice",
    authorFollowers: overrides.authorFollowers ?? null,
    content: overrides.content ?? "fixture mention",
    url,
    normalizedUrl: overrides.normalizedUrl ?? url,
    sentiment: overrides.sentiment ?? "neutral",
    engagement: overrides.engagement ?? 0,
    reach: overrides.reach ?? 0,
    postedAt: overrides.postedAt ?? DEFAULT_TIMESTAMP,
    discoveredAt: overrides.discoveredAt ?? "2026-04-20T00:10:00.000Z",
    isInfluencer: overrides.isInfluencer ?? false,
    ...overrides,
  };
}

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    userId: overrides.userId ?? "user-1",
    username: overrides.username ?? "tester",
    email: overrides.email ?? "tester@example.com",
    role: overrides.role ?? "user",
    ...overrides,
  };
}
