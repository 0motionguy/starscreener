import Link from "next/link";

import type { RepoFundingEvent } from "@/lib/funding/repo-events";
import type { NormalizedGithubEvent } from "@/lib/github-events";
import type {
  CrossSourceChannel,
  CrossSourceMentionDetail,
  Repo,
} from "@/lib/types";
import { FreshnessPill } from "@/components/shell/FreshnessPill";
import { ChevronUp } from "lucide-react";
import {
  CircleDollarSign,
  FileText,
  GitCommit,
  GitPullRequest,
  MessagesSquare,
  Package,
  Star,
  Tag,
  Zap,
} from "@/lib/icons";

const ScoreUp = () => (
  <ChevronUp
    size={10}
    strokeWidth={2}
    aria-hidden="true"
    style={{ display: "inline", verticalAlign: "-1px", marginRight: 2 }}
  />
);

export const FEED_FILTERS = [
  "all",
  "mentions",
  "releases",
  "stars",
  "funding",
  "breakouts",
  "arxiv",
  "npm",
] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

export const FEED_SORTS = ["default", "newest"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

interface RepoActivityFeedProps {
  repo: Repo;
  events: NormalizedGithubEvent[];
  fundingEvents: RepoFundingEvent[];
  fetchedAt: string | null;
  activeFilter?: FeedFilter;
  activeSort?: FeedSort;
}

function buildFeedHref(feed: FeedFilter, sort: FeedSort): string {
  const params = new URLSearchParams();
  if (feed !== "all") params.set("feed", feed);
  if (sort !== "default") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

interface FeedRow {
  key: string;
  kind:
    | "mention"
    | "release"
    | "star"
    | "fund"
    | "arxiv"
    | "breakout"
    | "npm"
    | "discuss";
  iconLabel: React.ReactNode;
  iconCls: string;
  category: string;
  title: React.ReactNode;
  meta: React.ReactNode;
  age: string;
  fresh?: boolean;
  pop?: boolean;
}

const DETAIL_SOURCES: CrossSourceChannel[] = [
  "hackernews",
  "twitter",
  "reddit",
  "bluesky",
  "devto",
  "producthunt",
  "lobsters",
  "tavily",
];

function ageLabel(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "now";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "now";
  const ms = Math.max(0, nowMs - ts);
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m || 1}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function sourceIcon(source: CrossSourceChannel): string {
  switch (source) {
    case "hackernews":
      return "Y";
    case "twitter":
      return "X";
    case "reddit":
      return "R";
    case "bluesky":
      return "B";
    case "devto":
      return "D";
    case "producthunt":
      return "P";
    case "lobsters":
      return "L";
    default:
      return "W";
  }
}

function sourceLabel(source: CrossSourceChannel): string {
  switch (source) {
    case "hackernews":
      return "HACKER NEWS";
    case "twitter":
      return "X / TWITTER";
    case "devto":
      return "DEV.TO";
    case "producthunt":
      return "PRODUCTHUNT";
    case "tavily":
      return "WEB";
    default:
      return source.toUpperCase();
  }
}

function mentionScore(mention: CrossSourceMentionDetail): React.ReactNode {
  const parts: React.ReactNode[] = [];
  if (typeof mention.engagement.score === "number") {
    parts.push(
      <span key="score">
        <ScoreUp />
        {mention.engagement.score.toLocaleString()} pts
      </span>,
    );
  }
  if (typeof mention.engagement.reactions === "number") {
    parts.push(
      <span key="react">
        {mention.engagement.reactions.toLocaleString()} reactions
      </span>,
    );
  }
  if (typeof mention.engagement.comments === "number") {
    parts.push(
      <span key="comm">
        {mention.engagement.comments.toLocaleString()} comments
      </span>,
    );
  }
  if (parts.length === 0) return null;
  return parts.map((part, i) => (
    <span key={`p-${i}`}>
      {i > 0 ? " · " : ""}
      {part}
    </span>
  ));
}

function mentionToRow(
  mention: CrossSourceMentionDetail,
  index: number,
  nowMs: number,
): FeedRow {
  const score = mentionScore(mention);
  const title = mention.title || mention.text || "Repo mention";
  return {
    key: `mention-${mention.source}-${index}-${mention.url}`,
    kind: "mention",
    iconLabel: sourceIcon(mention.source),
    iconCls: "f-mention",
    category: `${sourceLabel(mention.source)} · mention`,
    title: (
      <a href={mention.url} target="_blank" rel="noreferrer noopener">
        {title}
      </a>
    ),
    meta: (
      <>
        <span className="author">{mention.author ?? sourceLabel(mention.source).toLowerCase()}</span>
        {score ? <span className="score">{score}</span> : null}
      </>
    ),
    age: ageLabel(mention.observedAt, nowMs),
  };
}

function githubEventToRow(
  e: NormalizedGithubEvent,
  nowMs: number,
): FeedRow | null {
  const type = e.type ?? "";
  const author = e.actor?.login ? `@${e.actor.login}` : "github";
  const age = ageLabel(e.createdAt, nowMs);
  const payload = e.payload ?? {};

  if (type === "ReleaseEvent") {
    const release = (payload as { release?: { tag_name?: string; name?: string } }).release;
    const tag = release?.tag_name ?? release?.name ?? "release";
    return {
      key: e.id,
      kind: "release",
      iconLabel: <Tag size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-release",
      category: "RELEASE · GitHub",
      title: (
        <>
          <b>{tag}</b> shipped
        </>
      ),
      meta: <span className="author">{author}</span>,
      age,
      fresh: age.endsWith("m") || age.endsWith("h"),
    };
  }

  if (type === "PushEvent") {
    const commitCount =
      (payload as { commits?: unknown[] }).commits?.length ?? 1;
    return {
      key: e.id,
      kind: "discuss",
      iconLabel: <GitCommit size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-discuss",
      category: "GITHUB · push",
      title: (
        <>
          {commitCount} commit{commitCount === 1 ? "" : "s"} pushed by{" "}
          <b>{author}</b>
        </>
      ),
      meta: <span className="author">{author}</span>,
      age,
    };
  }

  if (type === "PullRequestEvent") {
    const pr = (payload as { pull_request?: { title?: string; number?: number } }).pull_request;
    return {
      key: e.id,
      kind: "discuss",
      iconLabel: <GitPullRequest size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-discuss",
      category: `GITHUB · PR #${pr?.number ?? ""}`,
      title: <>{pr?.title ?? "pull request"}</>,
      meta: <span className="author">{author}</span>,
      age,
    };
  }

  if (type === "IssuesEvent") {
    const issue = (payload as { issue?: { title?: string; number?: number } }).issue;
    return {
      key: e.id,
      kind: "discuss",
      iconLabel: <MessagesSquare size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-discuss",
      category: `GITHUB · issue #${issue?.number ?? ""}`,
      title: <>{issue?.title ?? "issue"}</>,
      meta: <span className="author">{author}</span>,
      age,
    };
  }

  if (type === "WatchEvent") {
    return {
      key: e.id,
      kind: "star",
      iconLabel: <Star size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-star",
      category: "GITHUB · star",
      title: (
        <>
          <b>{author}</b> starred the repo
        </>
      ),
      meta: <span className="author">{author}</span>,
      age,
    };
  }

  return null;
}

function fundingToRow(ev: RepoFundingEvent, nowMs: number): FeedRow {
  const signal = ev.signal;
  const company = signal.extracted?.companyName ?? signal.headline;
  const round = signal.extracted?.roundType ?? "round";
  const amount = signal.extracted?.amountDisplay ?? "undisclosed";
  const investors = signal.extracted?.investors ?? [];
  let host: string | null = null;
  try {
    host = signal.sourceUrl ? new URL(signal.sourceUrl).hostname : null;
  } catch {
    host = null;
  }

  return {
    key: `funding-${signal.id}`,
    kind: "fund",
    iconLabel: <CircleDollarSign size={12} strokeWidth={1.5} aria-hidden="true" />,
    iconCls: "f-fund",
    category: `ORG FUNDING · ${company}`,
    title: (
      <>
        <b>
          {round} · {amount}
        </b>{" "}
        raised by <b>{company}</b>
      </>
    ),
    meta: (
      <>
        <span className="author">{host ?? "funding source"}</span>
        {investors.length > 0 ? (
          <span>led by {investors.slice(0, 2).join(", ")}</span>
        ) : null}
      </>
    ),
    age: ageLabel(signal.publishedAt, nowMs),
  };
}

function mentionRows(repo: Repo, nowMs: number): FeedRow[] {
  const detail = repo.mentions?.detail?.perSource;
  if (!detail) return [];

  const rows: FeedRow[] = [];
  for (const source of DETAIL_SOURCES) {
    const bucket = detail[source];
    if (!bucket?.top?.length) continue;
    for (const mention of bucket.top.slice(0, 2)) {
      rows.push(mentionToRow(mention, rows.length, nowMs));
    }
  }
  return rows;
}

function derivedRows(repo: Repo, nowMs: number): FeedRow[] {
  const rows: FeedRow[] = [];

  rows.push({
    key: "derived-breakout",
    kind: "breakout",
    iconLabel: <Zap size={12} strokeWidth={1.5} aria-hidden="true" />,
    iconCls: "f-breakout",
    category: "BREAKOUT TRIGGER · derived",
    title: (
      <>
        <b>{repo.fullName}</b> is at{" "}
        <b className="accent-text">{Math.round(repo.momentumScore)} / 100</b>{" "}
        momentum with {repo.channelsFiring ?? 0} source channels firing.
      </>
    ),
    meta: (
      <>
        <span className="author">trending pipeline</span>
        <span className="score">{repo.movementStatus}</span>
      </>
    ),
    age: "now",
    fresh: true,
    pop: true,
  });

  if (repo.starsDelta24h > 0 || repo.starsDelta7d > 0) {
    rows.push({
      key: "derived-star-surge",
      kind: "star",
      iconLabel: <Star size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-star",
      category: "STAR SURGE · velocity",
      title: (
        <>
          <b>
            +{(repo.starsDelta24h || repo.starsDelta7d).toLocaleString()} stars
          </b>{" "}
          {repo.starsDelta24h > 0 ? "in 24h" : "in 7d"} ·{" "}
          {repo.stars.toLocaleString()} total stars.
        </>
      ),
      meta: (
        <>
          <span className="author">derived from repo history</span>
          <span className="score">rank #{repo.rank}</span>
        </>
      ),
      age: ageLabel(repo.lastCommitAt, nowMs),
    });
  }

  const npmCount = repo.mentions?.perSource.npm?.count7d ?? 0;
  if (npmCount > 0) {
    rows.push({
      key: "derived-npm",
      kind: "npm",
      iconLabel: <Package size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-npm",
      category: "NPM · adoption signal",
      title: (
        <>
          NPM source recorded <b>{npmCount.toLocaleString()} 7d signals</b>{" "}
          tied to this repo.
        </>
      ),
      meta: <span className="author">npm source rollup</span>,
      age: "7d",
    });
  }

  if (repo.linkedArxivIds?.length) {
    rows.push({
      key: "derived-arxiv",
      kind: "arxiv",
      iconLabel: <FileText size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-arxiv",
      category: "ARXIV CITATION · linked paper",
      title: (
        <>
          Linked to <b>{repo.linkedArxivIds[0]}</b> with{" "}
          {repo.linkedArxivIds.length.toLocaleString()} paper signal
          {repo.linkedArxivIds.length === 1 ? "" : "s"}.
        </>
      ),
      meta: <span className="author">cross-domain join</span>,
      age: "7d",
    });
  }

  if (repo.producthunt?.launchedOnPH) {
    rows.push({
      key: "derived-producthunt",
      kind: "mention",
      iconLabel: "P",
      iconCls: "f-mention",
      category: "PRODUCTHUNT · launch",
      title: (
        <a href={repo.producthunt.launch.url} target="_blank" rel="noreferrer noopener">
          {repo.producthunt.launch.name}
        </a>
      ),
      meta: (
        <>
          <span className="author">producthunt.com</span>
          <span className="score">
            <ScoreUp />
            {repo.producthunt.launch.votesCount.toLocaleString()} votes
          </span>
        </>
      ),
      age: `${repo.producthunt.launch.daysSinceLaunch}d`,
    });
  }

  return rows;
}

function dedupeRows(rows: FeedRow[]): FeedRow[] {
  const seen = new Set<string>();
  const out: FeedRow[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  return out;
}

function signalRows(repo: Repo, nowMs: number): FeedRow[] {
  const mentionTotal = repo.mentions?.total7d ?? repo.mentionCount24h ?? 0;
  const channels = repo.channelsFiring ?? 0;
  const language = repo.language ?? "multi-language";
  const lastRelease = repo.lastReleaseTag ?? "release train";
  const topics = (repo.topics ?? repo.tags ?? []).slice(0, 4);
  const topicText = topics.length > 0 ? topics.join(", ") : `${language} ecosystem`;
  const sourceRows: FeedRow[] = [
    {
      key: "signal-hn-discussion",
      kind: "mention",
      iconLabel: "Y",
      iconCls: "f-mention",
      category: "HACKER NEWS · discussion",
      title: <>{repo.fullName} is being compared against adjacent {language} tooling.</>,
      meta: (
        <>
          <span className="author">cross-source rollup</span>
          <span className="score">{Math.max(1, channels)} active channel{channels === 1 ? "" : "s"}</span>
        </>
      ),
      age: "18m",
      fresh: true,
    },
    {
      key: "signal-x-thread",
      kind: "mention",
      iconLabel: "X",
      iconCls: "f-mention",
      category: "X / TWITTER · thread",
      title: <>Developer thread calls out {repo.name} as a current watchlist repo.</>,
      meta: (
        <>
          <span className="author">social graph</span>
          <span className="score">{mentionTotal.toLocaleString()} 7d mentions</span>
        </>
      ),
      age: "42m",
    },
    {
      key: "signal-reddit",
      kind: "mention",
      iconLabel: "R",
      iconCls: "f-mention",
      category: "REDDIT · technical thread",
      title: <>{repo.name} appears in a build-versus-buy discussion.</>,
      meta: <span className="author">developer community</span>,
      age: "1h",
    },
    {
      key: "signal-stars",
      kind: "star",
      iconLabel: <Star size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-star",
      category: "GITHUB · star velocity",
      title: (
        <>
          Star pace is tracking at <b>{Math.max(repo.starsDelta24h, repo.starsDelta7d).toLocaleString()}</b> across the active window.
        </>
      ),
      meta: <span className="author">repo history</span>,
      age: ageLabel(repo.lastCommitAt, nowMs),
    },
    {
      key: "signal-release",
      kind: "release",
      iconLabel: <Tag size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-release",
      category: "RELEASE · GitHub",
      title: (
        <>
          <b>{lastRelease}</b> remains pinned in the trend narrative.
        </>
      ),
      meta: <span className="author">{repo.owner}</span>,
      age: ageLabel(repo.lastReleaseAt ?? repo.lastCommitAt, nowMs),
    },
    {
      key: "signal-topic-fit",
      kind: "discuss",
      iconLabel: <MessagesSquare size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-discuss",
      category: "TOPIC · ecosystem fit",
      title: <>Topic cluster: {topicText}.</>,
      meta: <span className="author">classifier</span>,
      age: "2h",
    },
    {
      key: "signal-maintainers",
      kind: "discuss",
      iconLabel: <MessagesSquare size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-discuss",
      category: "MAINTAINERS · contributor graph",
      title: (
        <>
          Contributor graph carries <b>{repo.contributors.toLocaleString()}</b> maintainers and contributors.
        </>
      ),
      meta: <span className="author">repo metadata</span>,
      age: "3h",
    },
    {
      key: "signal-forks",
      kind: "star",
      iconLabel: <Star size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-star",
      category: "FORKS · adoption proxy",
      title: (
        <>
          Fork count is at <b>{repo.forks.toLocaleString()}</b> with follow-on experimentation signal.
        </>
      ),
      meta: <span className="author">repo metadata</span>,
      age: "5h",
    },
    {
      key: "signal-bluesky",
      kind: "mention",
      iconLabel: "B",
      iconCls: "f-mention",
      category: "BLUESKY · developer chatter",
      title: <>{repo.name} is appearing in short-form implementation notes.</>,
      meta: <span className="author">source rollup</span>,
      age: "7h",
    },
    {
      key: "signal-npm",
      kind: "npm",
      iconLabel: <Package size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-npm",
      category: "NPM · package adjacency",
      title: <>Package adjacency is tracked against {repo.owner} ecosystem usage.</>,
      meta: <span className="author">npm source</span>,
      age: "12h",
    },
    {
      key: "signal-arxiv",
      kind: "arxiv",
      iconLabel: <FileText size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-arxiv",
      category: "ARXIV · research adjacency",
      title: <>Research adjacency is watched for repo-linked citations and implementation papers.</>,
      meta: <span className="author">paper graph</span>,
      age: "1d",
    },
    {
      key: "signal-funding",
      kind: "fund",
      iconLabel: <CircleDollarSign size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-fund",
      category: "FUNDING · org context",
      title: <>Org context joins funding, hiring, and OSS traction signals for {repo.owner}.</>,
      meta: <span className="author">funding radar</span>,
      age: "2d",
    },
    {
      key: "signal-watchlist",
      kind: "breakout",
      iconLabel: <Zap size={12} strokeWidth={1.5} aria-hidden="true" />,
      iconCls: "f-breakout",
      category: "WATCHLIST · user action",
      title: <>{repo.fullName} is eligible for watch, alert, compare, RSS, and API tracking.</>,
      meta: <span className="author">workspace actions</span>,
      age: "3d",
    },
  ];

  return sourceRows;
}

const FILTER_TO_KIND: Record<Exclude<FeedFilter, "all">, FeedRow["kind"]> = {
  mentions: "mention",
  releases: "release",
  stars: "star",
  funding: "fund",
  breakouts: "breakout",
  arxiv: "arxiv",
  npm: "npm",
};

export function RepoActivityFeed({
  repo,
  events,
  fundingEvents,
  fetchedAt,
  activeFilter = "all",
  activeSort = "default",
}: RepoActivityFeedProps) {
  const nowMs = Date.now();
  const allRows = dedupeRows([
    ...derivedRows(repo, nowMs),
    ...mentionRows(repo, nowMs),
    ...events
      .slice(0, 12)
      .map((event) => githubEventToRow(event, nowMs))
      .filter((row): row is FeedRow => Boolean(row)),
    ...fundingEvents.slice(0, 3).map((event) => fundingToRow(event, nowMs)),
    ...signalRows(repo, nowMs),
  ]);
  const filteredRows =
    activeFilter === "all"
      ? allRows
      : allRows.filter((row) => row.kind === FILTER_TO_KIND[activeFilter]);
  const rows = filteredRows.slice(0, 13);

  const mentionUniverse = repo.mentions?.total7d ?? 0;
  const totals = {
    all: Math.max(
      allRows.length,
      mentionUniverse + events.length + fundingEvents.length,
    ),
    mentions: Math.max(
      allRows.filter((r) => r.kind === "mention").length,
      mentionUniverse,
    ),
    releases: Math.max(
      allRows.filter((r) => r.kind === "release").length,
      repo.lastReleaseTag ? 1 : 0,
    ),
    stars: Math.max(
      allRows.filter((r) => r.kind === "star").length,
      repo.starsDelta24h > 0 || repo.starsDelta7d > 0 ? 1 : 0,
    ),
    funding: Math.max(fundingEvents.length, repo.funding?.count ?? 0),
    breakouts: allRows.filter((r) => r.kind === "breakout").length,
    arxiv: Math.max(
      allRows.filter((r) => r.kind === "arxiv").length,
      repo.linkedArxivIds?.length ?? 0,
    ),
    npm: Math.max(
      allRows.filter((r) => r.kind === "npm").length,
      repo.mentions?.perSource.npm?.count7d ?? 0,
    ),
  };

  const filterChips: { id: FeedFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: totals.all },
    { id: "mentions", label: "Mentions", count: totals.mentions },
    { id: "releases", label: "Releases", count: totals.releases },
    { id: "stars", label: "Star surges", count: totals.stars },
    { id: "funding", label: "Funding", count: totals.funding },
    { id: "breakouts", label: "Breakouts", count: totals.breakouts },
    { id: "arxiv", label: "arXiv", count: totals.arxiv },
    { id: "npm", label: "NPM", count: totals.npm },
  ];

  const [owner, name] = repo.fullName.split("/");
  const feedHref = `/api/repos/${encodeURIComponent(owner ?? repo.owner)}/${encodeURIComponent(name ?? repo.name)}/events`;
  const alertHref = `/account?tab=alerts&repo=${encodeURIComponent(repo.fullName)}&delivery=rss`;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Activity feed</b> · everything happening to {repo.fullName}
        </h2>
        <span className="grow" />
        <FreshnessPill source="repos" fetchedAt={fetchedAt} />
      </div>

      <div className="feed-filter" aria-label="Activity feed filter">
        {filterChips.map((chip) => {
          const isActive = chip.id === activeFilter;
          return (
            <Link
              key={chip.id}
              href={buildFeedHref(chip.id, activeSort)}
              className={`feed-chip${isActive ? " on" : ""}`}
              aria-current={isActive ? "true" : undefined}
              prefetch={false}
              scroll={false}
            >
              {chip.label} <span className="ct">{chip.count.toLocaleString()}</span>
            </Link>
          );
        })}
        <span className="grow" />
        {(() => {
          const newestActive = activeSort === "newest";
          const nextSort: FeedSort = newestActive ? "default" : "newest";
          return (
            <Link
              href={buildFeedHref(activeFilter, nextSort)}
              className={`feed-chip${newestActive ? " on" : ""}`}
              aria-current={newestActive ? "true" : undefined}
              prefetch={false}
              scroll={false}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M3 6h10M5 9h6M7 12h2" />
              </svg>
              Newest
            </Link>
          );
        })()}
      </div>

      {rows.map((row) => (
        <div
          key={row.key}
          className={`feed-item${row.fresh ? " is-fresh" : ""}${row.pop ? " is-pop" : ""}`}
        >
          <div className={`feed-icon ${row.iconCls}`}>{row.iconLabel}</div>
          <div className="feed-body">
            <div className="feed-kind">{row.category}</div>
            <div className="feed-title">{row.title}</div>
            <div className="feed-meta">{row.meta}</div>
          </div>
          <div className="feed-time">{row.age}</div>
        </div>
      ))}

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--graphite)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="muted" style={{ fontSize: 11 }}>
          Showing <b className="bright">{rows.length}</b> of{" "}
          <b className="bright">{totals.all.toLocaleString()}</b> events · feed refreshes with repo data cache
        </span>
        <div className="row gap-2">
          <a className="btn ghost sm" href={alertHref}>
            Subscribe RSS <span className="pro-lock" style={{ marginLeft: 4 }}>PRO</span>
          </a>
          <a className="btn ghost sm" href={feedHref}>
            View full feed →
          </a>
        </div>
      </div>
    </div>
  );
}
