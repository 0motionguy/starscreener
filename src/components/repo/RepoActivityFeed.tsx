// RepoActivityFeed — server component. Unified feed of recent events:
// github events (push / release / PR / issue) merged with funding events
// for the repo's org. Empty state when no events are available.
//
// Active state on filter chips is a placeholder: the prototype HTML shows
// them as static buttons. A later phase wires them to a `?filter=` query.
// SSR markup never sets `.on` on more than one — React still owns the flip
// when interactivity arrives.

import type { NormalizedGithubEvent } from "@/lib/github-events";
import type { RepoFundingEvent } from "@/lib/funding/repo-events";
import type { Repo } from "@/lib/types";
import { FreshnessPill } from "@/components/shell/FreshnessPill";

interface RepoActivityFeedProps {
  repo: Repo;
  events: NormalizedGithubEvent[];
  fundingEvents: RepoFundingEvent[];
  fetchedAt: string | null;
}

interface FeedRow {
  key: string;
  kind: "mention" | "release" | "star" | "fund" | "arxiv" | "breakout" | "npm" | "discuss";
  iconLabel: string;
  iconCls: string;
  category: string;
  title: React.ReactNode;
  meta: React.ReactNode;
  age: string;
}

function ageLabel(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  const ms = Math.max(0, nowMs - ts);
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m || 1}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
      iconLabel: "▲",
      iconCls: "f-release",
      category: "RELEASE · GitHub",
      title: (
        <>
          <b>{tag}</b> shipped
        </>
      ),
      meta: <span className="author">{author}</span>,
      age,
    };
  }
  if (type === "PushEvent") {
    const commitCount =
      (payload as { commits?: unknown[] }).commits?.length ?? 1;
    return {
      key: e.id,
      kind: "discuss",
      iconLabel: "↑",
      iconCls: "f-mention",
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
      iconLabel: "◆",
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
      iconLabel: "◆",
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
      iconLabel: "★",
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
  const s = ev.signal;
  const company = s.extracted?.companyName ?? s.headline;
  const round = s.extracted?.roundType ?? "round";
  const amount = s.extracted?.amountDisplay ?? "undisclosed";
  const investors = s.extracted?.investors ?? [];
  let host: string | null = null;
  try {
    host = s.sourceUrl ? new URL(s.sourceUrl).hostname : null;
  } catch {
    host = null;
  }
  return {
    key: `funding-${s.id}`,
    kind: "fund",
    iconLabel: "$",
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
        <span className="author">{host ?? "press release"}</span>
        {investors.length > 0 ? (
          <span>led by {investors.slice(0, 2).join(", ")}</span>
        ) : null}
      </>
    ),
    age: ageLabel(s.publishedAt, nowMs),
  };
}

export function RepoActivityFeed({
  repo,
  events,
  fundingEvents,
  fetchedAt,
}: RepoActivityFeedProps) {
  const nowMs = Date.now();

  const rows: FeedRow[] = [];
  for (const e of events.slice(0, 12)) {
    const row = githubEventToRow(e, nowMs);
    if (row) rows.push(row);
  }
  for (const f of fundingEvents.slice(0, 3)) {
    rows.push(fundingToRow(f, nowMs));
  }

  // Filter chip counts — derived from rows.
  const totals = {
    all: rows.length,
    mentions: rows.filter((r) => r.kind === "mention").length,
    releases: rows.filter((r) => r.kind === "release").length,
    stars: rows.filter((r) => r.kind === "star").length,
    funding: rows.filter((r) => r.kind === "fund").length,
    breakouts: rows.filter((r) => r.kind === "breakout").length,
    arxiv: rows.filter((r) => r.kind === "arxiv").length,
    npm: rows.filter((r) => r.kind === "npm").length,
    discuss: rows.filter((r) => r.kind === "discuss").length,
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▌ <b>Activity feed</b> · everything happening to {repo.fullName}
        </h2>
        <span className="grow" />
        <FreshnessPill source="repos" fetchedAt={fetchedAt} />
      </div>

      <div className="feed-filter">
        <button type="button" className="feed-chip on">
          All <span className="ct">{totals.all}</span>
        </button>
        <button type="button" className="feed-chip">
          Mentions <span className="ct">{totals.mentions}</span>
        </button>
        <button type="button" className="feed-chip">
          Releases <span className="ct">{totals.releases}</span>
        </button>
        <button type="button" className="feed-chip">
          Stars <span className="ct">{totals.stars}</span>
        </button>
        <button type="button" className="feed-chip">
          Funding <span className="ct">{totals.funding}</span>
        </button>
        <button type="button" className="feed-chip">
          Breakouts <span className="ct">{totals.breakouts}</span>
        </button>
        <button type="button" className="feed-chip">
          arXiv <span className="ct">{totals.arxiv}</span>
        </button>
        <button type="button" className="feed-chip">
          NPM <span className="ct">{totals.npm}</span>
        </button>
      </div>

      {rows.length === 0 ? (
        <div
          className="feed-empty"
          style={{
            padding: "32px 16px",
            color: "var(--fg-faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          No activity captured for this repo yet. The github-events fetcher
          and the funding-news matcher will surface entries here as they fire.
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="feed-item">
            <div className={`feed-icon ${row.iconCls}`}>{row.iconLabel}</div>
            <div className="feed-body">
              <div className="feed-kind">{row.category}</div>
              <div className="feed-title">{row.title}</div>
              <div className="feed-meta">{row.meta}</div>
            </div>
            <div className="feed-time">{row.age}</div>
          </div>
        ))
      )}

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--graphite)",
        }}
      >
        <span className="muted" style={{ fontSize: 11 }}>
          Showing <b className="bright">{rows.length} events</b> · feed
          updates every <b className="bright">30s</b>
        </span>
      </div>
    </div>
  );
}
