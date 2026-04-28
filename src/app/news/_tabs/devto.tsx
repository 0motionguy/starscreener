// /news — dev.to tab body (extracted from page.tsx, APP-05).
// Server component; consumes already-resolved data passed from page.tsx.

import {
  devtoArticleHref,
  getDevtoFile,
  getDevtoLeaderboard,
  devtoCold,
  type DevtoTopArticleRef,
} from "@/lib/devto";
import {
  ColdCard,
  ComingSoonNote,
  FullViewLink,
  ListShell,
  StatTile,
  formatAgeHours,
  formatRelative,
} from "../_shared";

export function DevtoTabBody() {
  const file = getDevtoFile();
  const leaderboard = getDevtoLeaderboard();
  const sliceCount = file.discoverySlices?.length ?? 0;
  const tagCount = file.priorityTags?.length ?? 0;

  const rows: { repo: string; article: DevtoTopArticleRef }[] = [];
  for (const entry of leaderboard) {
    const mention = file.mentions[entry.fullName];
    if (mention?.topArticle) {
      rows.push({ repo: entry.fullName, article: mention.topArticle });
    }
    if (rows.length >= 10) break;
  }

  const articlesScanned = file.scannedArticles;
  const reposLinked = leaderboard.length;

  if (devtoCold) {
    return (
      <ColdCard
        title="// dev.to cold"
        body={
          <>
            No dev.to data yet. Run{" "}
            <code className="text-text-primary">npm run scrape:devto</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">data/devto-mentions.json</code>
            .
          </>
        }
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.fetchedAt)}
          hint="dev.to"
        />
        <StatTile
          label="ARTICLES SCANNED"
          value={articlesScanned.toLocaleString("en-US")}
          hint={`${file.windowDays}d window`}
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="github mentions 7d"
        />
        <StatTile
          label="DISCOVERY"
          value={sliceCount.toLocaleString("en-US")}
          hint={
            sliceCount > 0
              ? `${tagCount} tags + rising/fresh`
              : "registry-driven slices"
          }
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>TITLE · AUTHOR</div>
          <div className="text-right">REACT</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">READ</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {rows.map(({ repo, article }, i) => (
            <li
              key={`${repo}-${article.id}`}
              className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
            >
              <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                {i + 1}
              </div>
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                <a
                  href={devtoArticleHref(article.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                  title={article.title}
                >
                  {article.title}
                </a>
                <span
                  className="shrink-0 text-[10px] truncate"
                  style={{ color: "var(--v2-ink-400)" }}
                  title={article.author}
                >
                  @{article.author}
                  <span className="sm:hidden">{` · ${article.comments.toLocaleString("en-US")} cmts · ${article.readingTime}m · ${formatAgeHours(article.hoursSincePosted)}`}</span>
                </span>
              </div>
              <div className="text-right text-xs tabular-nums text-text-secondary">
                {article.reactions.toLocaleString("en-US")}
              </div>
              <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                {article.comments.toLocaleString("en-US")}
              </div>
              <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                {`${article.readingTime}m`}
              </div>
              <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                {formatAgeHours(article.hoursSincePosted)}
              </div>
            </li>
          ))}
        </ul>
      </ListShell>

      <ComingSoonNote message="dedicated /devto page coming soon" />
    </>
  );
}
