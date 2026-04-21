// /producthunt — full ProductHunt launches view.
//
// Mirrors the rhythm of /hackernews/trending and /bluesky/trending: header
// strip, 4 stat tiles, list below. Shows ALL AI-adjacent launches from the
// last 7-day window (typically ~50) ordered by vote count. Each row shows
// thumbnail, name, tagline, topics, makers, votes, age, and deep links to
// the PH post + GitHub (when extracted).
//
// This is the dedicated deep view referenced by /news?tab=producthunt —
// the News Terminal tab renders the top 10 digest; this page shows
// everything plus a leaderboard of tracked repos that launched on PH.

import type { Metadata } from "next";
import Link from "next/link";
import {
  getPhFile,
  producthuntCold,
} from "@/lib/producthunt";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "StarScreener — ProductHunt Launches",
  description:
    "AI-adjacent ProductHunt launches from the last 7 days, ordered by vote count — with GitHub repo links when extracted.",
};

const PH_ORANGE = "#DA552F";

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatAge(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

export default function ProductHuntPage() {
  const file = getPhFile();
  const launches = file.launches ?? [];
  const cold = producthuntCold || launches.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Breadcrumb + Header */}
        <div className="mb-2 text-[11px] text-text-tertiary font-mono">
          <Link
            href="/news?tab=producthunt"
            className="hover:text-brand transition-colors"
          >
            ← News Terminal
          </Link>
        </div>
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <span style={{ color: PH_ORANGE }} aria-hidden>
                ▲
              </span>
              PRODUCTHUNT / ALL LAUNCHES
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// AI-adjacent launches · last 7d · ranked by votes"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-2xl">
            Every AI-adjacent ProductHunt launch from the 7-day window: 4
            topic queries (artificial-intelligence, developer-tools, saas,
            productivity) plus a broad RANKING sweep, keyword-filtered for
            LLM / agent / MCP / skill / RAG jargon. github.com URLs are
            extracted opportunistically from launch descriptions — tracked-
            repo matches link to the repo&apos;s StarScreener page.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* Stat tiles */}
            <LaunchesStats launches={launches} fetchedAt={file.lastFetchedAt} />

            {/* Leaderboard (only if any tracked repos were linked) */}
            <LinkedReposLeaderboard launches={launches} />

            {/* Full feed */}
            <LaunchFeed launches={launches} />
          </>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function LaunchesStats({
  launches,
  fetchedAt,
}: {
  launches: ReturnType<typeof getPhFile>["launches"];
  fetchedAt: string;
}) {
  const totalVotes = launches.reduce((s, l) => s + l.votesCount, 0);
  const hotLaunches = launches.filter((l) => l.votesCount >= 200).length;
  const linkedRepos = launches.filter((l) => l.linkedRepo).length;
  const withGithub = launches.filter((l) => l.githubUrl).length;

  return (
    <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatTile
        label="LAST SCRAPE"
        value={formatRelative(fetchedAt)}
        hint={new Date(fetchedAt).toISOString().slice(0, 16).replace("T", " ")}
      />
      <StatTile
        label="LAUNCHES"
        value={launches.length.toLocaleString()}
        hint={`${totalVotes.toLocaleString()} total votes`}
      />
      <StatTile
        label="HOT"
        value={hotLaunches.toLocaleString()}
        hint="≥200 votes"
      />
      <StatTile
        label="LINKED"
        value={linkedRepos.toLocaleString()}
        hint={`${withGithub} with github.com URL`}
      />
    </section>
  );
}

function LinkedReposLeaderboard({
  launches,
}: {
  launches: ReturnType<typeof getPhFile>["launches"];
}) {
  const linked = launches.filter((l) => l.linkedRepo);
  if (linked.length === 0) return null;

  return (
    <section className="mb-6 border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="px-3 h-9 flex items-center border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        TRACKED REPOS THAT LAUNCHED ({linked.length})
      </div>
      <ul className="divide-y divide-border-primary/40">
        {linked.map((l) => {
          const repo = l.linkedRepo
            ? getDerivedRepoByFullName(l.linkedRepo)
            : null;
          return (
            <li
              key={l.id}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-text-primary font-semibold truncate">
                  {l.name}
                </span>
                <span className="text-[10px] text-text-tertiary">—</span>
                {repo ? (
                  <Link
                    href={`/repo/${repo.owner}/${repo.name}`}
                    className="text-xs text-text-tertiary font-mono hover:text-functional transition-colors truncate"
                  >
                    {repo.fullName}
                  </Link>
                ) : (
                  <span className="text-xs text-text-tertiary font-mono truncate">
                    {l.linkedRepo}
                  </span>
                )}
              </span>
              <span
                className="text-xs tabular-nums"
                style={{ color: PH_ORANGE }}
              >
                ▲{l.votesCount.toLocaleString()}
              </span>
              <span className="text-[11px] tabular-nums text-text-tertiary">
                {formatAge(l.daysSinceLaunch)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LaunchFeed({
  launches,
}: {
  launches: ReturnType<typeof getPhFile>["launches"];
}) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="grid grid-cols-[40px_56px_1fr_80px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div></div>
        <div>LAUNCH</div>
        <div className="text-right">VOTES</div>
        <div className="text-right">AGE</div>
      </div>
      <ul>
        {launches.map((l, i) => (
          <li
            key={l.id}
            className="grid grid-cols-[40px_56px_1fr_80px_80px] gap-3 items-start px-3 py-3 hover:bg-bg-card-hover border-b border-border-primary/40 last:border-b-0"
          >
            <div className="text-text-tertiary text-xs tabular-nums pt-1">
              {i + 1}
            </div>
            {l.thumbnail ? (
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
                aria-label={`${l.name} on ProductHunt`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.thumbnail}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  className="size-12 rounded-md border border-border-primary bg-bg-tertiary object-cover"
                />
              </a>
            ) : (
              <div
                aria-hidden
                className="size-12 shrink-0 rounded-md border border-border-primary bg-bg-tertiary flex items-center justify-center font-mono text-[18px]"
                style={{ color: PH_ORANGE }}
              >
                ▲
              </div>
            )}
            <div className="min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-text-primary hover:text-brand truncate"
                  title={l.name}
                >
                  {l.name}
                </a>
              </div>
              <p className="text-[12px] text-text-secondary line-clamp-1">
                {l.tagline}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {l.topics.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] text-text-tertiary font-mono"
                  >
                    {t}
                  </span>
                ))}
                {l.linkedRepo ? (
                  <Link
                    href={`/repo/${l.linkedRepo.split("/")[0]}/${l.linkedRepo.split("/")[1]}`}
                    className="text-[10px] font-mono text-functional hover:text-functional/80 transition-colors"
                  >
                    {l.linkedRepo} →
                  </Link>
                ) : l.githubUrl ? (
                  <a
                    href={l.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    GitHub →
                  </a>
                ) : null}
                {l.makers.length > 0 ? (
                  <span className="text-[10px] text-text-tertiary font-mono">
                    by {l.makers
                      .slice(0, 2)
                      .map((m) => `@${m.username || m.name}`)
                      .join(", ")}
                    {l.makers.length > 2 ? ` +${l.makers.length - 2}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
            <div
              className="text-right text-xs tabular-nums pt-1"
              style={{ color: PH_ORANGE }}
            >
              ▲{l.votesCount.toLocaleString()}
            </div>
            <div className="text-right text-xs tabular-nums text-text-tertiary pt-1">
              {formatAge(l.daysSinceLaunch)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: PH_ORANGE }}
      >
        {"// no launches yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The ProductHunt scraper hasn&apos;t run yet. Set{" "}
        <code className="text-text-primary">PRODUCTHUNT_TOKEN</code> and run{" "}
        <code className="text-text-primary">npm run scrape:ph</code> locally to
        populate{" "}
        <code className="text-text-primary">
          data/producthunt-launches.json
        </code>
        , then refresh.
      </p>
    </section>
  );
}
