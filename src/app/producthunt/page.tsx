// /producthunt â€” full ProductHunt launches view.
//
// Mirrors the structural/visual rhythm of /hackernews/trending: header strip,
// 4 stat tiles, list below. Renders the top 50 AI-adjacent launches from the
// last 7-day window, ordered by votes desc. The compact 10-row tab inside
// /news?tab=producthunt is the morning glance â€” this page is the deep dive.
//
// Server component + force-static: data comes from the producthunt loader,
// which reads committed JSON, so every request is identical until the next
// scrape lands.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MessageSquare, ChevronUp } from "lucide-react";
import { LaunchLinkIcons } from "@/components/producthunt/LaunchLinkIcons";
import {
  getAiLaunches,
  getRecentLaunches,
  producthuntCold,
  refreshProducthuntLaunchesFromStore,
  type Launch,
  type ProductHuntFile,
} from "@/lib/producthunt";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { buildProductHuntHeader } from "@/components/news/newsTopMetrics";
import { SourceFeedTemplate } from "@/components/source-feed/SourceFeedTemplate";

const PH_ACCENT = "rgba(218, 85, 47, 0.85)";

type PhTab = "ai" | "all";
const VALID_TABS: PhTab[] = ["ai", "all"];
const DEFAULT_TAB: PhTab = "ai";

function parseTab(raw: string | string[] | undefined): PhTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return (VALID_TABS as readonly string[]).includes(candidate ?? "")
    ? (candidate as PhTab)
    : DEFAULT_TAB;
}

// ISR with 10-min revalidate. Each `?tab=...` variant gets its own
// cache entry (ISR keys by URL incl. query string), so tab switching
// still works while popular tabs serve from edge cache instead of
// rebuilding per request. Underlying data is committed JSON.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "TrendingRepo â€” ProductHunt Launches",
  description:
    "Daily ProductHunt launches scored by votes/comments, cross-linked to GitHub repos when the maker mentions one.",
};

const PH_RED = "#DA552F";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface ProductHuntPageProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function ProductHuntPage({
  searchParams,
}: ProductHuntPageProps) {
  await refreshProducthuntLaunchesFromStore();
  const { tab: rawTab } = await searchParams;
  const activeTab = parseTab(rawTab);

  // Pull ALL 7d launches, then split for counts. The "AI" tab filters down
  // to aiAdjacent only; "All" shows everything. Both tabs share the same
  // source JSON so vote counts / tag data / redirects stay consistent.
  const all7d = getRecentLaunches(7);
  const ai7d = getAiLaunches(7);
  const current = activeTab === "ai" ? ai7d : all7d;

  // Only `current` (the filtered tab feed) and `topLaunches` are read
  // below now that the legacy stat tiles are gone. The 24h/linked-repo
  // counts are exposed by the V3 snapshot card via the builder math.
  const cold = producthuntCold;

  // Top 50 of the current tab, sorted by votes desc. Getter preserves
  // scraper order; re-sort here so the page contract is explicit.
  const topLaunches: Launch[] = [...current]
    .sort((a, b) => b.votesCount - a.votesCount)
    .slice(0, 50);

  return (
    <SourceFeedTemplate
      cold={cold}
      coldState={<ColdState />}
      header={{
        routeTitle: `PRODUCTHUNT - ${activeTab === "ai" ? "AI LAUNCHES" : "ALL LAUNCHES"}`,
        liveLabel: "LIVE - 7D",
        eyebrow: "// PRODUCTHUNT - LIVE FIREHOSE",
        meta: [
          { label: "TRACKED", value: current.length.toLocaleString("en-US") },
          { label: "WINDOW", value: "7D" },
        ],
        ...buildProductHuntHeader(
          ({ launches: current } as Pick<ProductHuntFile, "launches">) as ProductHuntFile,
          topLaunches.slice(0, 3),
        ),
        accent: PH_ACCENT,
        caption: [
          "// LAYOUT compact-v1",
          "- 3-COL - 320 / 1FR / 1FR",
          "- DATA UNCHANGED",
        ],
      }}
    >
      <div className="mb-6">
        <TabNav active={activeTab} aiCount={ai7d.length} allCount={all7d.length} />
      </div>

      {topLaunches.length > 0 ? (
        <>
          <LaunchFeed launches={topLaunches} />
          <CrossLinkedReposPanel launches={current} />
        </>
      ) : (
        <EmptyState tab={activeTab} />
      )}
    </SourceFeedTemplate>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function LaunchFeed({ launches }: { launches: Launch[] }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      {/* Header row â€” desktop columns. Mobile hides thumbnail + comments. */}
      <div className="hidden md:grid grid-cols-[40px_60px_minmax(0,1fr)_72px_80px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div></div>
        <div>NAME Â· TAGLINE</div>
        <div className="text-center">LINKS</div>
        <div className="text-right">VOTES</div>
        <div className="text-right">CMTS</div>
        <div className="text-right">POSTED</div>
      </div>
      <div className="grid md:hidden grid-cols-[32px_1fr_60px_70px] gap-2 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>NAME</div>
        <div className="text-right">VOTES</div>
        <div className="text-right">POSTED</div>
      </div>

      <ul>
        {launches.map((l, i) => {
          const rank = i + 1;
          const isHot = l.votesCount >= 200;
          return (
            <li
              key={l.id}
              className="border-b border-border-primary/40 last:border-b-0"
            >
              {/* Desktop layout */}
              <div className="hidden md:grid grid-cols-[40px_60px_minmax(0,1fr)_72px_80px_60px_80px] gap-3 items-center px-3 py-2 min-h-[56px] hover:bg-bg-card-hover transition-colors">
                <div
                  className="text-xs tabular-nums font-semibold"
                  style={{ color: rank <= 10 ? PH_RED : undefined }}
                >
                  #{rank}
                </div>
                <div>
                  <ThumbLink launch={l} />
                </div>
                <div className="min-w-0">
                  <NameTagline launch={l} />
                </div>
                <div className="flex items-center justify-center">
                  <LaunchLinkIcons launch={l} />
                </div>
                <div
                  className="text-right text-xs tabular-nums inline-flex items-center justify-end gap-1"
                  style={isHot ? { color: PH_RED } : undefined}
                >
                  <ChevronUp size={11} className="shrink-0" />
                  {l.votesCount.toLocaleString("en-US")}
                </div>
                <div className="text-right text-xs tabular-nums text-text-secondary inline-flex items-center justify-end gap-1">
                  <MessageSquare size={10} className="shrink-0 opacity-70" />
                  {l.commentsCount.toLocaleString("en-US")}
                </div>
                <div className="text-right text-xs tabular-nums text-text-tertiary">
                  {formatRelative(l.createdAt)}
                </div>
              </div>

              {/* Mobile layout â€” hides thumbnail + comments per spec */}
              <div className="grid md:hidden grid-cols-[32px_1fr_60px_70px] gap-2 items-center px-3 py-2 min-h-[56px] hover:bg-bg-card-hover transition-colors">
                <div
                  className="text-xs tabular-nums font-semibold"
                  style={{ color: rank <= 10 ? PH_RED : undefined }}
                >
                  #{rank}
                </div>
                <div className="min-w-0">
                  <NameTagline launch={l} />
                  <LaunchLinkIcons launch={l} className="mt-1" />
                </div>
                <div
                  className="text-right text-xs tabular-nums inline-flex items-center justify-end gap-1"
                  style={isHot ? { color: PH_RED } : undefined}
                >
                  <ChevronUp size={11} className="shrink-0" />
                  {l.votesCount.toLocaleString("en-US")}
                </div>
                <div className="text-right text-xs tabular-nums text-text-tertiary">
                  {formatRelative(l.createdAt)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ThumbLink({ launch }: { launch: Launch }) {
  if (launch.thumbnail) {
    return (
      <a
        href={launch.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 block"
        aria-label={`${launch.name} on ProductHunt`}
      >
        <Image
          src={launch.thumbnail}
          alt=""
          width={40}
          height={40}
          className="size-10 rounded-md border border-border-primary bg-bg-tertiary object-cover"
        />
      </a>
    );
  }
  return (
    <div
      aria-hidden
      className="size-10 shrink-0 rounded-md border border-border-primary bg-bg-tertiary flex items-center justify-center font-mono text-[16px]"
      style={{ color: PH_RED }}
    >
      â–²
    </div>
  );
}

function NameTagline({ launch }: { launch: Launch }) {
  const tags = (launch.tags ?? []).slice(0, 4);
  const stars = launch.githubRepo?.stars;
  return (
    <div className="min-w-0">
      <a
        href={launch.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block min-w-0"
        title={`${launch.name} â€” ${launch.tagline}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm text-text-primary font-semibold truncate hover:text-brand transition-colors">
            {launch.name}
          </span>
          {tags.map((t) => (
            <span
              key={t}
              className="text-[9px] font-mono uppercase tracking-wider rounded-sm px-1 py-px bg-brand/15 text-brand shrink-0"
              title={`Keyword tag derived from the repo topics / README: ${t}`}
            >
              {t}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-text-tertiary truncate">
          {launch.tagline}
        </p>
      </a>
      {launch.githubUrl ? (
        <a
          href={launch.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono text-text-tertiary hover:text-functional transition-colors"
          title={
            stars !== undefined
              ? `${launch.githubUrl.replace(/^https?:\/\/github\.com\//, "")} Â· ${stars.toLocaleString("en-US")}â˜…`
              : launch.githubUrl
          }
        >
          <span aria-hidden>â†—</span>
          <span className="truncate">
            {launch.githubUrl.replace(/^https?:\/\/github\.com\//, "")}
          </span>
          {stars !== undefined ? (
            <span className="text-text-muted">Â· {stars.toLocaleString("en-US")}â˜…</span>
          ) : null}
        </a>
      ) : null}
    </div>
  );
}

function CrossLinkedReposPanel({ launches }: { launches: Launch[] }) {
  // Filter to launches that both (a) have a linkedRepo extracted from the
  // description AND (b) match a repo currently tracked by TrendingRepo.
  // Drop the panel entirely when zero matches â€” empty crosslink boxes look
  // broken on a fresh scrape day where nobody linked GitHub.
  const rows = launches
    .filter((l): l is Launch & { linkedRepo: string } => Boolean(l.linkedRepo))
    .map((l) => ({ launch: l, repo: getDerivedRepoByFullName(l.linkedRepo) }))
    .filter((r) => r.repo !== null)
    .slice(0, 10);

  if (rows.length === 0) return null;

  return (
    <section className="mt-6 border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="px-3 h-9 flex items-center border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        CROSS-LINKED REPOS ({rows.length})
        <span className="ml-2 text-text-tertiary/70 normal-case tracking-normal">
          {"// tracked repos that launched on PH this week"}
        </span>
      </div>
      <ul className="divide-y divide-border-primary/40">
        {rows.map(({ launch, repo }) => {
          if (!repo) return null;
          return (
            <li
              key={launch.id}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 h-10 hover:bg-bg-card-hover transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <a
                  href={launch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-text-primary font-semibold truncate hover:text-brand transition-colors"
                >
                  {launch.name}
                </a>
                <span className="text-[10px] text-text-tertiary">â†’</span>
                <Link
                  href={`/repo/${repo.owner}/${repo.name}`}
                  className="text-xs text-text-tertiary font-mono hover:text-functional transition-colors truncate"
                >
                  {repo.fullName}
                </Link>
              </span>
              <span
                className="text-xs tabular-nums inline-flex items-center gap-1"
                style={{ color: PH_RED }}
              >
                <ChevronUp size={11} />
                {launch.votesCount.toLocaleString("en-US")}
              </span>
              <span className="text-[11px] tabular-nums text-text-tertiary">
                {formatRelative(launch.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}


function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: PH_RED }}
      >
        {"// no producthunt data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        No ProductHunt launches loaded. Set{" "}
        <code className="text-text-primary">PRODUCTHUNT_TOKEN</code> and run{" "}
        <code className="text-text-primary">npm run scrape:ph</code> locally to
        populate{" "}
        <code className="text-text-primary">data/producthunt-launches.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}

function EmptyState({ tab }: { tab: PhTab }) {
  const body =
    tab === "ai"
      ? "The ProductHunt scrape completed, but no launches matched the AI-adjacent 7-day filter. Try the All Launches tab for the full PH feed."
      : "The ProductHunt scrape completed, but returned zero launches in the last 7 days. Fresh empty data, not a missing token or failed scraper run.";
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: PH_RED }}
      >
        {"// no matching launches in this window"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">{body}</p>
    </section>
  );
}

function TabNav({
  active,
  aiCount,
  allCount,
}: {
  active: PhTab;
  aiCount: number;
  allCount: number;
}) {
  const tabs: { id: PhTab; label: string; count: number; hint: string }[] = [
    {
      id: "ai",
      label: "AI Launches",
      count: aiCount,
      hint: "llm Â· agent Â· mcp Â· skill Â· rag",
    },
    {
      id: "all",
      label: "All Launches",
      count: allCount,
      hint: "full PH feed, no filter",
    },
  ];
  return (
    <nav
      aria-label="ProductHunt tabs"
      className="mb-6 flex items-center gap-1 border-b border-border-primary overflow-x-auto scrollbar-hide"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        const href = `/producthunt?tab=${t.id}`;
        return (
          <Link
            key={t.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-3 min-h-[40px] text-xs uppercase tracking-wider whitespace-nowrap transition-colors ${
              isActive
                ? "text-text-primary border-b-2"
                : "text-text-tertiary hover:text-text-secondary border-b-2 border-transparent"
            }`}
            style={isActive ? { borderBottomColor: PH_RED } : undefined}
            title={t.hint}
          >
            {t.label}
            <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded text-[10px] tabular-nums bg-bg-secondary border border-border-primary text-text-tertiary">
              {t.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

