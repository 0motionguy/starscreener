// /news — ProductHunt tab body (extracted from page.tsx, APP-05).
// Server component; consumes already-resolved data passed from page.tsx.

import {
  getRecentLaunches,
  getPhFile,
  type Launch,
} from "@/lib/producthunt";
import { LaunchLinkIcons } from "@/components/producthunt/LaunchLinkIcons";
import {
  PH_RED,
  ColdCard,
  FullViewLink,
  ListShell,
  StatTile,
  formatAgeHours,
  formatRelative,
  truncate,
} from "../_shared";

export function ProductHuntTabBody({ launches }: { launches: Launch[] }) {
  const file = getPhFile();
  const allLaunches = file.launches ?? [];
  const cold = !file.lastFetchedAt || !Array.isArray(file.launches);

  if (cold) {
    return (
      <ColdCard
        title="// producthunt cold"
        body={
          <>
            No ProductHunt launches loaded. Run{" "}
            <code className="text-text-primary">npm run scrape:ph</code>{" "}
            locally to populate{" "}
            <code className="text-text-primary">
              data/producthunt-launches.json
            </code>
            .
          </>
        }
        accent={PH_RED}
      />
    );
  }

  const totalVotes = allLaunches.reduce((acc, l) => acc + (l.votesCount ?? 0), 0);
  const linkedRepos = allLaunches.filter((l) => l.linkedRepo).length;

  return (
    <>
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="LAST SCRAPE"
          value={formatRelative(file.lastFetchedAt)}
          hint="producthunt"
        />
        <StatTile
          label="LAUNCHES TRACKED"
          value={allLaunches.length.toLocaleString("en-US")}
          hint={`${file.windowDays}d window`}
        />
        <StatTile
          label="TOTAL VOTES"
          value={totalVotes.toLocaleString("en-US")}
          hint="across all launches"
        />
        <StatTile
          label="REPOS LINKED"
          value={linkedRepos.toLocaleString("en-US")}
          hint="github links resolved"
        />
      </section>

      {launches.length > 0 ? (
        <ListShell>
          <div className="hidden sm:grid grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 h-9 border-b text-[10px] uppercase tracking-wider"
            style={{ borderColor: "var(--v2-line-100)", color: "var(--v2-ink-400)" }}
          >
            <div>#</div>
            <div>NAME · TAGLINE</div>
            <div className="text-right">VOTES</div>
            <div className="text-right">CMTS</div>
            <div className="text-right">DAYS</div>
            <div className="text-right">DATE</div>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--v2-line-100)" }}>
            {launches.map((l, i) => {
              const isHigh = l.votesCount >= 200;
              const t = new Date(l.createdAt).getTime();
              const launchDate = Number.isFinite(t)
                ? new Date(l.createdAt).toISOString().slice(5, 10)
                : "—";
              return (
                <li
                  key={l.id}
                  className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_60px_60px_60px_80px] gap-3 items-center px-3 min-h-[44px] sm:h-10 py-2 sm:py-0 hover:bg-bg-card-hover transition-colors"
                >
                  <div style={{ color: "var(--v2-ink-400)" }} className="text-xs tabular-nums">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-y-0.5 sm:gap-x-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-text-primary hover:text-[color:var(--v2-acc)] truncate"
                      title={`${l.name} — ${l.tagline}`}
                    >
                      <span className="font-semibold">{l.name}</span>
                      {l.tagline ? (
                        <span className="text-text-tertiary"> · {l.tagline}</span>
                      ) : null}
                    </a>
                    <LaunchLinkIcons launch={l} />
                    <span className="sm:hidden text-[10px] tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                      {`${l.commentsCount.toLocaleString("en-US")} cmts · ${l.daysSinceLaunch}d · ${launchDate}`}
                    </span>
                  </div>
                  <div
                    className="text-right text-xs tabular-nums"
                    style={isHigh ? { color: PH_RED } : undefined}
                  >
                    {l.votesCount.toLocaleString("en-US")}
                  </div>
                  <div className="hidden sm:block text-right text-xs tabular-nums text-text-secondary">
                    {l.commentsCount.toLocaleString("en-US")}
                  </div>
                  <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    {`${l.daysSinceLaunch}d`}
                  </div>
                  <div className="hidden sm:block text-right text-xs tabular-nums" style={{ color: "var(--v2-ink-400)" }}>
                    {launchDate}
                  </div>
                </li>
              );
            })}
          </ul>
        </ListShell>
      ) : (
        <ColdCard
          title="// no producthunt matches"
          body={
            <>
              The ProductHunt scrape completed, but no launches matched the
              current AI-adjacent 7-day filter.
            </>
          }
          accent={PH_RED}
        />
      )}

      <FullViewLink href="/producthunt" label="View full" />
    </>
  );
}
