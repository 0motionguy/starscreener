// /producthunt — V4 SourceFeedTemplate consumer.
//
// Top 50 PH launches in the last 7 days, ordered by votes desc. AI vs All
// tabs share the same source JSON; "AI" filters via the aiAdjacent flag,
// "All" shows everything. Template provides PageHead + KpiBand snapshot +
// list slot; the existing LaunchFeed / CrossLinkedReposPanel / TabNav
// render inside the list slot unchanged.

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
} from "@/lib/producthunt";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

const PH_RED = "#DA552F";

type PhTab = "ai" | "all";
const VALID_TABS: PhTab[] = ["ai", "all"];
const DEFAULT_TAB: PhTab = "ai";

function parseTab(raw: string | string[] | undefined): PhTab {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return (VALID_TABS as readonly string[]).includes(candidate ?? "")
    ? (candidate as PhTab)
    : DEFAULT_TAB;
}

// ISR with 10-min revalidate. Each `?tab=...` variant gets its own cache
// entry (ISR keys by URL incl. query string), so tab switching still works
// while popular tabs serve from edge cache.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "TrendingRepo — ProductHunt Launches",
  description:
    "Daily ProductHunt launches scored by votes/comments, cross-linked to GitHub repos when the maker mentions one.",
};

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

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
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
  const cold = producthuntCold;

  // Top 50 of the current tab, sorted by votes desc. Getter preserves
  // scraper order; re-sort here so the page contract is explicit.
  const topLaunches: Launch[] = [...current]
    .sort((a, b) => b.votesCount - a.votesCount)
    .slice(0, 50);

  // Pull lastFetchedAt off the loader's getter — we don't need to import
  // the file shape directly because getPhFile() drives off the same cache.
  // The clock value is fine to fall back to "warming" when the store is cold.
  const fetchedAt = !cold ? topLaunches[0]?.createdAt : undefined;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>PH</b> · TERMINAL · /PRODUCTHUNT
            </>
          }
          title="ProductHunt · launches"
          lede="Top launches in the last 7 days, ordered by votes desc. AI tab filters to llm / agent / mcp / skill / rag adjacent products; All tab shows the full PH feed."
        />
        <ColdState />
      </main>
    );
  }

  // KpiBand math.
  const topVotes = current.reduce((m, l) => Math.max(m, l.votesCount), 0);
  const makerSet = new Set<string>();
  for (const l of current) {
    for (const m of l.makers ?? []) {
      if (m.username) makerSet.add(m.username.toLowerCase());
    }
  }
  const makerCount = makerSet.size;
  const ghLinkedCount = current.filter((l) => Boolean(l.linkedRepo)).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>PH</b> · TERMINAL · /PRODUCTHUNT
          </>
        }
        title={`ProductHunt · ${activeTab === "ai" ? "AI launches" : "all launches"}`}
        lede="Top launches in the last 7 days, ordered by votes desc. AI tab filters to llm / agent / mcp / skill / rag adjacent products; All tab shows the full PH feed."
        clock={
          <>
            <span className="big">{formatClock(fetchedAt)}</span>
            <span className="muted">UTC · LATEST POST</span>
            <LiveDot label="LIVE · 7D" />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: current.length.toLocaleString("en-US"),
                sub: "7d rolling",
                pip: PH_RED,
              },
              {
                label: "TOP VOTES",
                value: topVotes.toLocaleString("en-US"),
                sub: "engagement peak",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "MAKERS",
                value: makerCount.toLocaleString("en-US"),
                sub: "unique shippers",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: ghLinkedCount,
                sub: "launches w/ repo",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow={`Launch feed · top 50 by votes (${activeTab === "ai" ? "AI" : "ALL"})`}
        list={
          <>
            <div className="mb-4">
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
          </>
        }
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function LaunchFeed({ launches }: { launches: Launch[] }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      {/* Header row — desktop columns. Mobile hides thumbnail + comments. */}
      <div className="hidden md:grid grid-cols-[40px_60px_minmax(0,1fr)_72px_80px_60px_80px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div></div>
        <div>NAME · TAGLINE</div>
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

              {/* Mobile layout — hides thumbnail + comments per spec */}
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
      ▲
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
        title={`${launch.name} — ${launch.tagline}`}
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
              ? `${launch.githubUrl.replace(/^https?:\/\/github\.com\//, "")} · ${stars.toLocaleString("en-US")}★`
              : launch.githubUrl
          }
        >
          <span aria-hidden>↗</span>
          <span className="truncate">
            {launch.githubUrl.replace(/^https?:\/\/github\.com\//, "")}
          </span>
          {stars !== undefined ? (
            <span className="text-text-muted">· {stars.toLocaleString("en-US")}★</span>
          ) : null}
        </a>
      ) : null}
    </div>
  );
}

function CrossLinkedReposPanel({ launches }: { launches: Launch[] }) {
  // Filter to launches that both (a) have a linkedRepo extracted from the
  // description AND (b) match a repo currently tracked by TrendingRepo.
  // Drop the panel entirely when zero matches — empty crosslink boxes look
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
                <span className="text-[10px] text-text-tertiary">→</span>
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

// ---------------------------------------------------------------------------
// Cold-state + empty fallback
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: PH_RED,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no producthunt data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        No ProductHunt launches loaded. Set{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>PRODUCTHUNT_TOKEN</code>{" "}
        and run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:ph</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/producthunt-launches.json</code>
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
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: PH_RED,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no matching launches in this window"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        {body}
      </p>
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
      hint: "llm · agent · mcp · skill · rag",
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
      className="flex items-center gap-1 border-b border-border-primary overflow-x-auto scrollbar-hide"
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
