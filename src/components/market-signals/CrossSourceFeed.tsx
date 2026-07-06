// CrossSourceFeed — repos firing across multiple real mention sources.
//
// Real data only. No SEED_ROWS padding, no fillChannels() synthesizer that
// fabricated source diversity to hit a target count. If the spine has
// fewer than `limit` real hits, the feed renders shorter rather than
// inventing rows.

import Link from "next/link";

import type { Repo, SocialPlatform } from "@/lib/types";

/** Single threshold shared by the feed rows, the header chip, and the page KPI. */
export const CROSS_SOURCE_MIN_CHANNELS = 5;

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
  { key: "bluesky", cls: "bsky", title: "Bluesky", letter: "B" },
  { key: "devto", cls: "devto", title: "Dev.to", letter: "D" },
  { key: "producthunt", cls: "ph", title: "ProductHunt", letter: "P" },
  { key: "huggingface", cls: "hf", title: "Hugging Face", letter: "F" },
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

function repoHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "/market-signals";
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function channelStatus(repo: Repo, key: SocialPlatform): boolean {
  const perSource = repo.mentions?.perSource[key];
  if ((perSource?.count24h ?? 0) > 0) return true;
  if (key === "github") return (repo.starsDelta24h ?? 0) > 0;
  if (key === "hackernews") return repo.channelStatus?.hn ?? false;
  if (key === "twitter") return repo.channelStatus?.twitter ?? false;
  if (key === "bluesky") return repo.channelStatus?.bluesky ?? false;
  if (key === "devto") return repo.channelStatus?.devto ?? false;
  return false;
}

/**
 * Repos whose ACTIVE channel set — the same channelStatus() logic that lights
 * the feed rows' source marks — meets the threshold. Exported so the page KPI
 * counts exactly what this feed renders. (Previously the KPI used a stricter
 * perSource-only rule at a different threshold and could read 0 while the
 * feed below it showed 7 rows.)
 */
export function countCrossSourceRepos(
  repos: Repo[],
  minChannels: number = CROSS_SOURCE_MIN_CHANNELS,
): number {
  return repos.filter(
    (repo) =>
      CHANNELS.filter((channel) => channelStatus(repo, channel.key)).length >=
      minChannels,
  ).length;
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

function rowFromRepo(repo: Repo): FeedRow {
  const active = new Set<SocialPlatform>();
  for (const channel of CHANNELS) {
    if (channelStatus(repo, channel.key)) active.add(channel.key);
  }

  const totalMentions =
    repo.mentions?.total24h ??
    repo.mentionCount24h ??
    (repo.starsDelta24h ?? 0) + (repo.starsDelta7d ?? 0);
  const tag = repo.tags?.[0] ?? repo.topics?.[0] ?? repo.collectionNames?.[0] ?? "—";
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
    .map(rowFromRepo)
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
  return rows;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function CrossSourceFeed({
  repos,
  minChannels = CROSS_SOURCE_MIN_CHANNELS,
  limit = 7,
}: CrossSourceFeedProps) {
  const rows = buildRows(repos, minChannels, limit);
  // Honest total on the same channelStatus() basis as the rows themselves —
  // no synthetic floor, no second definition drifting from what's rendered.
  const totalHits = countCrossSourceRepos(repos, minChannels);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Cross-source mentions</b> - same repo on {minChannels}+ sources
        </h2>
        <span className="grow" />
        <span className="chip up">{totalHits.toLocaleString()} today</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "20px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-faint)" }}>
          No repos crossing {minChannels} sources right now — pipe is quiet.
        </div>
      ) : (
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
      )}
    </div>
  );
}
