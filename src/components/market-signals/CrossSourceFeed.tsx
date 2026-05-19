// CrossSourceFeed — feed of repos firing across multiple mention sources.
// Each row shows a strip of `.smark.<channel>` pips for every active
// source, the repo name, count, and final cross-signal score. Sorted by
// channels-firing desc, score desc.

import type { Repo, SocialPlatform } from "@/lib/types";

interface CrossSourceFeedProps {
  repos: Repo[];
  /** Min number of distinct firing channels for a row to surface. */
  minChannels?: number;
  /** Max rows to render. */
  limit?: number;
}

const CHANNELS: { key: SocialPlatform; cls: string; title: string }[] = [
  { key: "github", cls: "github", title: "GitHub" },
  { key: "hackernews", cls: "hn", title: "Hacker News" },
  { key: "twitter", cls: "x", title: "X" },
  { key: "reddit", cls: "reddit", title: "Reddit" },
  { key: "bluesky", cls: "bsky", title: "Bluesky" },
  { key: "devto", cls: "devto", title: "Dev.to" },
  { key: "producthunt", cls: "ph", title: "ProductHunt" },
  { key: "huggingface", cls: "hf", title: "HF" },
  { key: "arxiv", cls: "arxiv", title: "arXiv" },
  { key: "npm", cls: "npm", title: "npm" },
  { key: "lobsters", cls: "lobsters", title: "Lobsters" },
];

interface FeedRow {
  repo: Repo;
  channelsFiring: number;
  activeChannels: Set<SocialPlatform>;
  totalMentions: number;
  score: number;
}

function rankRepos(repos: Repo[], minChannels: number, limit: number): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const r of repos) {
    const perSource = r.mentions?.perSource;
    if (!perSource) continue;
    const active = new Set<SocialPlatform>();
    for (const ch of CHANNELS) {
      const ps = perSource[ch.key];
      if (ps && (ps.count24h ?? 0) > 0) active.add(ch.key);
    }
    if (active.size < minChannels) continue;
    rows.push({
      repo: r,
      channelsFiring: active.size,
      activeChannels: active,
      totalMentions: r.mentions?.total24h ?? r.mentionCount24h ?? 0,
      score:
        typeof r.crossSignalScore === "number" ? r.crossSignalScore : r.momentumScore / 16,
    });
  }
  rows.sort((a, b) => {
    if (b.channelsFiring !== a.channelsFiring)
      return b.channelsFiring - a.channelsFiring;
    if (b.score !== a.score) return b.score - a.score;
    return b.totalMentions - a.totalMentions;
  });
  return rows.slice(0, limit);
}

export function CrossSourceFeed({
  repos,
  minChannels = 5,
  limit = 30,
}: CrossSourceFeedProps) {
  const rows = rankRepos(repos, minChannels, limit);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            // 02 · cross-source mentions · ≥{minChannels} sources
          </span>
          <h2
            style={{
              fontSize: 15,
              color: "var(--fg-bright)",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            Multi-source breakouts
          </h2>
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-faint)",
          }}
        >
          {rows.length} repos
        </span>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: "32px 18px",
            textAlign: "center",
            color: "var(--fg-faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          No repos with ≥{minChannels} concurrent sources in the active window. Try the All / 24H view.
        </div>
      ) : (
        rows.map((row) => {
          const href = row.repo.url || `https://github.com/${row.repo.fullName}`;
          return (
            <a
              key={row.repo.id}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="xfeed-row"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                alignItems: "center",
                gap: 12,
                padding: "8px 10px",
                borderRadius: "var(--r-1)",
                textDecoration: "none",
                color: "var(--fg)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "var(--fg-bright)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.repo.fullName}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--fg-faint)",
                  }}
                >
                  {row.channelsFiring}/{CHANNELS.length} firing
                </span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {CHANNELS.map((ch) => {
                  const on = row.activeChannels.has(ch.key);
                  return (
                    <span
                      key={ch.key}
                      className={`smark ${ch.cls}`}
                      title={ch.title}
                      style={{
                        width: 14,
                        height: 14,
                        fontSize: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: on ? 1 : 0.25,
                        borderRadius: 2,
                      }}
                    >
                      {ch.title.slice(0, 1)}
                    </span>
                  );
                })}
              </div>
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--fg-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {row.totalMentions.toLocaleString()}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--accent)",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
              }}
            >
              {row.score.toFixed(2)}
            </span>
            </a>
          );
        })
      )}
    </div>
  );
}
