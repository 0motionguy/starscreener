// /news — Bluesky tab body (extracted from page.tsx, APP-05).
// Server component; consumes already-resolved data passed from page.tsx.

import {
  getBlueskyTrendingFile,
} from "@/lib/bluesky-trending";
import {
  blueskyCold,
  bskyPostHref,
  getBlueskyLeaderboard,
  type BskyPost,
} from "@/lib/bluesky";
import {
  BSKY_BLUE,
  ColdCard,
  FullViewLink,
  ListShell,
  StatTile,
  formatAgeHours,
  formatRelative,
  truncate,
} from "../_shared";

export function BlueskyTabBody({ posts }: { posts: BskyPost[] }) {
  const trendingFile = getBlueskyTrendingFile();
  const reposLinked = getBlueskyLeaderboard().length;
  const familyCount =
    trendingFile.queryFamilies?.length ?? trendingFile.keywords.length;
  const queryCount = trendingFile.queries?.length ?? trendingFile.keywords.length;
  const cold = blueskyCold || trendingFile.posts.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// bluesky cold"
        body={
          <>
            No Bluesky data yet — run{" "}
            <code className="text-text-primary">npm run scrape:bsky</code>{" "}
            locally (with{" "}
            <code className="text-text-primary">BLUESKY_HANDLE</code> +{" "}
            <code className="text-text-primary">BLUESKY_APP_PASSWORD</code>{" "}
            in env) to populate{" "}
            <code className="text-text-primary">
              data/bluesky-trending.json
            </code>
            .
          </>
        }
        accent={BSKY_BLUE}
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(trendingFile.fetchedAt)}
          hint="bluesky"
        />
        <StatTile
          label="POSTS TRACKED"
          value={trendingFile.posts.length.toLocaleString("en-US")}
          hint={`${queryCount} queries / ${familyCount} families`}
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="github mentions 7d"
        />
        <StatTile
          label="TOPIC FAMILIES"
          value={familyCount.toLocaleString("en-US")}
          hint={trendingFile.keywords.slice(0, 3).join(" · ")}
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>POST · AUTHOR</div>
          <div className="text-right">♥</div>
          <div className="text-right">⟲</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {posts.map((p, i) => {
            const snippet = truncate(p.text, 80);
            const isHigh = p.likeCount >= 50 || p.repostCount >= 5;
            return (
              <li
                key={p.uri}
                className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
              >
                <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                  <a
                    href={bskyPostHref(p.uri, p.author.handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                    title={p.text}
                  >
                    {snippet}
                  </a>
                  <span
                    className="shrink-0 text-[10px] truncate"
                    style={{ color: "var(--v2-ink-400)" }}
                    title={
                      p.author.displayName
                        ? `${p.author.displayName} (@${p.author.handle})`
                        : `@${p.author.handle}`
                    }
                  >
                    @{p.author.handle}
                    <span className="sm:hidden">{` · ${p.repostCount.toLocaleString("en-US")} ⟲ · ${p.replyCount.toLocaleString("en-US")} cmts · ${formatAgeHours(p.ageHours)}`}</span>
                  </span>
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: BSKY_BLUE } : undefined}
                >
                  {p.likeCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {p.repostCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {p.replyCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                  {formatAgeHours(p.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/bluesky/trending" label="View full" />
    </>
  );
}
