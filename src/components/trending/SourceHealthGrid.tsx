// SourceHealthGrid — right-column "Mention-source health" grid.

import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";

const SOURCES: { key: keyof Awaited<ReturnType<typeof getSidebarSourceCounts>>; cls: string; label: string }[] = [
  { key: "hackernewsStories", cls: "hn", label: "Hacker News" },
  { key: "lobstersStories", cls: "lobsters", label: "Lobsters" },
  { key: "devtoArticles", cls: "devto", label: "Dev.to" },
  { key: "blueskyPosts", cls: "bsky", label: "Bluesky" },
  { key: "redditPosts", cls: "reddit", label: "Reddit" },
  { key: "npmPackages", cls: "npm", label: "NPM" },
  { key: "arxivPapers", cls: "arxiv", label: "arXiv" },
];

export async function SourceHealthGrid() {
  const counts = await getSidebarSourceCounts().catch(() => null);
  const liveCount = counts ? SOURCES.filter((s) => (counts[s.key] ?? 0) > 0).length : 0;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          ▸ <b>Mention-source health</b>
        </h2>
        <span className="grow" />
        <span className="chip up">
          {liveCount} / {SOURCES.length}
        </span>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 1,
            background: "var(--border-subtle)",
            borderRadius: "var(--r-1)",
            overflow: "hidden",
          }}
        >
          {SOURCES.map((s) => {
            const value = counts?.[s.key] ?? 0;
            const isLive = value > 0;
            return (
              <div
                key={s.key as string}
                style={{
                  background: "var(--surface)",
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  <span className={`spip ${s.cls}${isLive ? " on" : ""}`} />
                  {s.label}
                </span>
                <span
                  className={isLive ? "up-text" : "warn-text"}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                >
                  {isLive ? "● " : "○ "} {value.toLocaleString()} cached
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
