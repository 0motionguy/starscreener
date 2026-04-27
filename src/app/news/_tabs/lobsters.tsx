// /news — Lobsters tab body (extracted from page.tsx, APP-05).
// Server component; consumes already-resolved data passed from page.tsx.

import Link from "next/link";
import {
  getLobstersTopStories,
  getLobstersTrendingFile,
} from "@/lib/lobsters-trending";
import {
  getLobstersLeaderboard,
  lobstersStoryHref,
  repoFullNameToHref,
  type LobstersStory,
} from "@/lib/lobsters";
import {
  ColdCard,
  FullViewLink,
  ListShell,
  StatTile,
  formatAgeHours,
  formatRelative,
} from "../_shared";

export function LobstersTabBody({ stories }: { stories: LobstersStory[] }) {
  const file = getLobstersTrendingFile();
  const allStories = file.stories ?? [];
  const linkedStories = allStories.filter(
    (story) => (story.linkedRepos?.length ?? 0) > 0,
  ).length;
  const reposLinked = getLobstersLeaderboard().length;
  const cold = allStories.length === 0;

  if (cold) {
    return (
      <ColdCard
        title="// lobsters cold"
        body={
          <>
            No Lobsters data yet. Run{" "}
            <code className="text-text-primary">npm run scrape:lobsters</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/lobsters-trending.json
            </code>
            .
          </>
        }
        accent="#ac130d"
      />
    );
  }

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.fetchedAt)}
          hint="lobsters"
        />
        <StatTile
          label="STORIES TRACKED"
          value={allStories.length.toLocaleString("en-US")}
          hint={`${file.windowHours}h window`}
        />
        <StatTile
          label="GITHUB STORIES"
          value={linkedStories.toLocaleString("en-US")}
          hint="tracked repo links"
        />
        <StatTile
          label="REPOS LINKED"
          value={reposLinked.toLocaleString("en-US")}
          hint="mentions 7d"
        />
      </section>

      <ListShell>
        <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
          style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
        >
          <div>#</div>
          <div>TITLE</div>
          <div className="text-right">SCORE</div>
          <div className="text-right">CMTS</div>
          <div className="text-right">AGE</div>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
          {stories.map((s, i) => {
            const linkedRepo = s.linkedRepos?.[0]?.fullName;
            const href = s.commentsUrl || lobstersStoryHref(s.shortId);
            const isHigh = s.score >= 25;
            return (
              <li
                key={s.shortId}
                className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
              >
                <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                  {i + 1}
                </div>
                <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                    title={s.title}
                  >
                    {s.title}
                  </a>
                  {linkedRepo ? (
                    <Link
                      href={repoFullNameToHref(linkedRepo)}
                      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary hover:text-[color:var(--v2-acc)] hover:border-[color:var(--v2-acc)]/50 transition-colors"
                      title={`Linked repo: ${linkedRepo}`}
                    >
                      {linkedRepo}
                    </Link>
                  ) : null}
                  <span className="sm:hidden text-[10px] tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    {`${s.commentCount.toLocaleString("en-US")} cmts · ${formatAgeHours(s.ageHours)}`}
                  </span>
                </div>
                <div
                  className="text-right text-xs tabular-nums"
                  style={isHigh ? { color: "#ac130d" } : undefined}
                >
                  {s.score.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                  {s.commentCount.toLocaleString("en-US")}
                </div>
                <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                  {formatAgeHours(s.ageHours)}
                </div>
              </li>
            );
          })}
        </ul>
      </ListShell>

      <FullViewLink href="/lobsters" label="View full" />
    </>
  );
}
