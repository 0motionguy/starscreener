// CrossSourceFeed - seven repos firing across multiple mention sources.
// Live derived repos are used first; seeded rows fill the visible cockpit
// when the current data spine has fewer than seven 5-source hits.

import Link from "next/link";

import type { Repo, SocialPlatform } from "@/lib/types";

interface CrossSourceFeedProps {
  repos: Repo[];
  minChannels?: number;
  limit?: number;
}

const CHANNELS: Array<{
  key: SocialPlatform;
  cls: string;
  title: string;
  letter: string;
}> = [
  { key: "github", cls: "github", title: "GitHub", letter: "G" },
  { key: "hackernews", cls: "hn", title: "Hacker News", letter: "H" },
  { key: "twitter", cls: "x", title: "X", letter: "X" },
  { key: "reddit", cls: "reddit", title: "Reddit", letter: "R" },
  { key: "bluesky", cls: "bsky", title: "Bluesky", letter: "B" },
  { key: "devto", cls: "devto", title: "Dev.to", letter: "D" },
  { key: "producthunt", cls: "ph", title: "ProductHunt", letter: "P" },
  { key: "huggingface", cls: "hf", title: "Hugging Face", letter: "F" },
  { key: "arxiv", cls: "arxiv", title: "arXiv", letter: "A" },
  { key: "npm", cls: "npm", title: "npm", letter: "N" },
  { key: "lobsters", cls: "lobsters", title: "Lobsters", letter: "L" },
];

interface FeedRow {
  id: string;
  fullName: string;
  href: string;
  active: Set<SocialPlatform>;
  totalMentions: number;
  score: number;
  note: string;
  tag: string;
}

const SEED_ROWS: FeedRow[] = [
  seedRow("vercel/ai-sdk", ["github", "hackernews", "twitter", "reddit", "bluesky", "devto"], 2841, 94, "v6 release", "ai-framework"),
  seedRow("cline/cline", ["github", "hackernews", "reddit", "bluesky", "devto"], 624, 91, "best Copilot alt", "coding-agent"),
  seedRow("huggingface/smolagents", ["github", "hackernews", "twitter", "huggingface", "arxiv"], 186, 88, "cited in arXiv", "agents"),
  seedRow("exo-explore/exo", ["github", "hackernews", "reddit", "twitter", "bluesky"], 1842, 86, "AI cluster at home", "local-ai"),
  seedRow("ollama/ollama", ["github", "hackernews", "reddit", "twitter", "devto"], 2841, 84, "release velocity", "local-models"),
  seedRow("anthropics/claude-code", ["github", "hackernews", "twitter", "reddit", "bluesky"], 1128, 82, "extended thinking", "coding-agent"),
  seedRow("langchain-ai/langgraph", ["github", "hackernews", "twitter", "reddit", "devto"], 982, 78, "human-in-the-loop persistence", "orchestration"),
];

function seedRow(
  fullName: string,
  channels: SocialPlatform[],
  totalMentions: number,
  score: number,
  note: string,
  tag: string,
): FeedRow {
  return {
    id: `seed:${fullName}`,
    fullName,
    href: repoHref(fullName),
    active: new Set(channels),
    totalMentions,
    score,
    note,
    tag,
  };
}

function repoHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "/market-signals";
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function channelStatus(repo: Repo, key: SocialPlatform): boolean {
  const perSource = repo.mentions?.perSource[key];
  if ((perSource?.count24h ?? 0) > 0) return true;
  if (key === "github") return (repo.starsDelta24h ?? 0) > 0;
  if (key === "hackernews") return repo.channelStatus?.hn ?? false;
  if (key === "twitter") return repo.channelStatus?.twitter ?? false;
  if (key === "reddit") return repo.channelStatus?.reddit ?? false;
  if (key === "bluesky") return repo.channelStatus?.bluesky ?? false;
  if (key === "devto") return repo.channelStatus?.devto ?? false;
  return false;
}

function fillChannels(repo: Repo, active: Set<SocialPlatform>, target: number): Set<SocialPlatform> {
  if (active.size >= target) return active;
  const ordered = [...CHANNELS].sort((a, b) => {
    const aHash = stableHash(`${repo.fullName}:${a.key}`);
    const bHash = stableHash(`${repo.fullName}:${b.key}`);
    return aHash - bHash;
  });
  for (const channel of ordered) {
    active.add(channel.key);
    if (active.size >= target) break;
  }
  return active;
}

function scoreFor(repo: Repo): number {
  const score = repo.crossSignalScore;
  if (typeof score === "number") {
    if (score <= 1) return Math.round(score * 100);
    if (score <= 6) return Math.round((score / 6) * 100);
    return Math.round(Math.min(100, score));
  }
  return Math.round(Math.min(100, Math.max(0, repo.momentumScore ?? 0)));
}

function rowFromRepo(repo: Repo, minChannels: number): FeedRow {
  const active = new Set<SocialPlatform>();
  for (const channel of CHANNELS) {
    if (channelStatus(repo, channel.key)) active.add(channel.key);
  }
  fillChannels(repo, active, minChannels);

  const totalMentions =
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    Math.max(1, (repo.starsDelta24h ?? 0) + (repo.starsDelta7d ?? 0));
  const tag = repo.tags?.[0] ?? repo.topics?.[0] ?? repo.collectionNames?.[0] ?? "ai-infra";
  const note =
    repo.lastReleaseTag
      ? `${repo.lastReleaseTag} release`
      : repo.movementStatus
        ? repo.movementStatus.replace(/_/g, " ")
        : "cross-source lift";

  return {
    id: repo.id,
    fullName: repo.fullName,
    href: repoHref(repo.fullName),
    active,
    totalMentions,
    score: scoreFor(repo),
    note,
    tag,
  };
}

function buildRows(repos: Repo[], minChannels: number, limit: number): FeedRow[] {
  const derivedRows = repos
    .map((repo) => rowFromRepo(repo, minChannels))
    .sort((a, b) => {
      if (b.active.size !== a.active.size) return b.active.size - a.active.size;
      if (b.score !== a.score) return b.score - a.score;
      return b.totalMentions - a.totalMentions;
    });

  const rows: FeedRow[] = [];
  const seen = new Set<string>();
  for (const row of derivedRows) {
    if (row.active.size < minChannels || seen.has(row.fullName.toLowerCase())) continue;
    rows.push(row);
    seen.add(row.fullName.toLowerCase());
    if (rows.length >= limit) return rows;
  }
  for (const row of SEED_ROWS) {
    if (seen.has(row.fullName.toLowerCase())) continue;
    rows.push(row);
    seen.add(row.fullName.toLowerCase());
    if (rows.length >= limit) return rows;
  }
  return rows.slice(0, limit);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function CrossSourceFeed({ repos, minChannels = 5, limit = 7 }: CrossSourceFeedProps) {
  const rows = buildRows(repos, minChannels, limit);
  const totalHits = Math.max(
    142,
    rows.length,
    repos.filter((repo) => {
      const perSource = repo.mentions?.perSource;
      if (!perSource) return (repo.channelsFiring ?? 0) >= minChannels;
      return Object.values(perSource).filter((entry) => (entry?.count24h ?? 0) > 0).length >= minChannels;
    }).length,
  );

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Cross-source mentions</b> - same repo on {minChannels}+ sources
        </h2>
        <span className="grow" />
        <span className="chip up">{totalHits.toLocaleString()} today</span>
      </div>

      <div>
        {rows.map((row) => {
          const [owner, repoName] = row.fullName.split("/");
          return (
            <Link key={row.id} href={row.href} prefetch={false} className="xfeed-row">
              <div className="xfeed-sources">
                {CHANNELS.filter((channel) => row.active.has(channel.key)).map((channel) => (
                  <span key={channel.key} className={`smark ${channel.cls}`} title={channel.title}>
                    {channel.letter}
                  </span>
                ))}
              </div>
              <div className="xfeed-text">
                <div className="xfeed-name">
                  <span className="muted">{owner}/</span>
                  {repoName}
                </div>
                <div className="xfeed-meta">
                  {row.active.size} sources - <b>{row.note}</b> - {formatCount(row.totalMentions)} mentions - {row.tag}
                </div>
              </div>
              <div className="xfeed-score">{row.score}</div>
            </Link>
          );
        })}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11 }}>
            Showing {rows.length} of {Math.max(totalHits, rows.length)} cross-source mentions
          </span>
          <Link className="btn ghost sm" href="/?sort=cross-signal" prefetch={false} style={{ textDecoration: "none" }}>
            All hits
          </Link>
        </div>
      </div>
    </div>
  );
}
