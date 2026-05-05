import { buildCanonicalRepoProfile, type CanonicalRepoProfile } from "@/lib/api/repo-profile";
import { getDataStore } from "@/lib/data-store";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { Repo } from "@/lib/types";

const WHY_TTL_SECONDS = 24 * 60 * 60;
const WHY_KEY_PREFIX = "repo";

export type WhySignal =
  | "release"
  | "hackernews"
  | "contributor_surge"
  | "stars_velocity"
  | "cross_signal";

export interface RepoWhyRecord {
  owner: string;
  name: string;
  fullName: string;
  signal: WhySignal;
  line: string;
  generatedAt: string;
}

function slugParts(fullName: string): { owner: string; name: string } {
  const [owner, name] = fullName.split("/");
  return { owner: owner ?? "", name: name ?? "" };
}

export function repoWhyKey(owner: string, name: string): string {
  return `${WHY_KEY_PREFIX}:${owner.toLowerCase()}:${name.toLowerCase()}:why`;
}

function dominantSignal(profile: CanonicalRepoProfile): WhySignal {
  const codes = new Set(profile.reasons.map((r) => r.code));
  if (codes.has("release_major") || codes.has("release_recent")) return "release";
  if (codes.has("hacker_news_front_page")) return "hackernews";
  if (codes.has("contributor_growth")) return "contributor_surge";
  if (codes.has("star_velocity_up") || codes.has("star_spike") || codes.has("rank_jump")) {
    return "stars_velocity";
  }
  return "cross_signal";
}

function buildLine(profile: CanonicalRepoProfile, signal: WhySignal): string {
  const repo = profile.repo;
  const stars24h = Math.max(0, repo.starsDelta24h);
  const mentions = profile.mentions.countsBySource;
  const hnMentions = mentions.hackernews ?? 0;
  const contributors = Math.max(0, repo.contributors ?? 0);
  switch (signal) {
    case "release":
      return `${repo.fullName} is trending after a fresh release cycle and fast follow-on developer activity. It gained +${stars24h.toLocaleString("en-US")} stars in the last 24h.`;
    case "hackernews":
      return `${repo.fullName} is trending from Hacker News attention and rapid GitHub pickup. It logged ${hnMentions.toLocaleString("en-US")} HN mentions and +${stars24h.toLocaleString("en-US")} stars in 24h.`;
    case "contributor_surge":
      return `${repo.fullName} is trending on contributor momentum and sustained shipping pace. The project currently tracks ${contributors.toLocaleString("en-US")} contributors with +${stars24h.toLocaleString("en-US")} stars in 24h.`;
    case "stars_velocity":
      return `${repo.fullName} is trending on star-velocity acceleration across the latest window. It added +${stars24h.toLocaleString("en-US")} stars in 24h and is climbing the momentum board.`;
    case "cross_signal":
    default:
      return `${repo.fullName} is trending on multi-source developer attention and steady GitHub growth. It moved +${stars24h.toLocaleString("en-US")} stars in 24h with cross-signal activity across discovery channels.`;
  }
}

function buildLineFromRepo(repo: Repo): RepoWhyRecord {
  const stars24h = Math.max(0, repo.starsDelta24h);
  const signal: WhySignal =
    (repo.crossSignalScore ?? 0) >= 3
      ? "cross_signal"
      : stars24h >= Math.max(20, Math.floor(repo.stars * 0.01))
        ? "stars_velocity"
        : "cross_signal";
  const line =
    signal === "stars_velocity"
      ? `${repo.fullName} is trending on star-velocity acceleration. It added +${stars24h.toLocaleString("en-US")} stars in 24h and is climbing the board.`
      : `${repo.fullName} is trending on multi-source developer attention and steady GitHub growth. It moved +${stars24h.toLocaleString("en-US")} stars in 24h.`;
  return {
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    signal,
    line,
    generatedAt: new Date().toISOString(),
  };
}

export async function getRepoWhy(owner: string, name: string): Promise<RepoWhyRecord | null> {
  const key = repoWhyKey(owner, name);
  const read = await getDataStore().read<RepoWhyRecord>(key);
  return read.data ?? null;
}

export async function generateAndPersistRepoWhy(
  fullName: string,
  profile?: CanonicalRepoProfile,
): Promise<RepoWhyRecord | null> {
  const { owner, name } = slugParts(fullName);
  if (!owner || !name) return null;

  const canonical = profile ?? (await buildCanonicalRepoProfile(`${owner}/${name}`));
  if (!canonical) return null;

  const signal = dominantSignal(canonical);
  const record: RepoWhyRecord = {
    owner: canonical.repo.owner,
    name: canonical.repo.name,
    fullName: canonical.repo.fullName,
    signal,
    line: buildLine(canonical, signal),
    generatedAt: new Date().toISOString(),
  };
  await getDataStore().write(repoWhyKey(record.owner, record.name), record, {
    ttlSeconds: WHY_TTL_SECONDS,
    writer: "agn-791-why-engine",
  });
  return record;
}

export async function getOrGenerateRepoWhy(
  fullName: string,
  profile?: CanonicalRepoProfile,
): Promise<RepoWhyRecord | null> {
  const { owner, name } = slugParts(fullName);
  const existing = await getRepoWhy(owner, name);
  if (existing?.line) return existing;
  return generateAndPersistRepoWhy(fullName, profile);
}

export async function ensureTopRepoWhys(limit = 50): Promise<number> {
  const top = getDerivedRepos()
    .slice()
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, Math.max(1, limit));
  let written = 0;
  for (const repo of top) {
    const fallback = buildLineFromRepo(repo);
    await getDataStore().write(repoWhyKey(fallback.owner, fallback.name), fallback, {
      ttlSeconds: WHY_TTL_SECONDS,
      writer: "agn-791-why-engine-fallback",
    });
    const out = fallback;
    if (out?.line) written += 1;
  }
  return written;
}
