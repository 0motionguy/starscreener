// /preview — launcher tile grid showing every rebuilt route at a glance.
// Pixel-faithful to index.html (the prototype launcher). Wave A foundation:
// 12 .pv-* tile preview compositions render inline preview art per tile,
// driven by the `previewVariant` field on the tiles array.

import Link from "next/link";
import { refreshTrendingFromStore, getTrackedRepoCount } from "@/lib/trending";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { listIdeas } from "@/lib/ideas";
import {
  PvAccount,
  PvBreakout,
  PvBuild,
  PvDetail,
  PvDrop,
  PvIdeas,
  PvM2M,
  PvMoney,
  PvMrr,
  PvSignals,
  PvTools,
  PvTrending,
  type PreviewVariant,
} from "@/components/preview/tile-previews";

export const revalidate = 3600;

export const metadata = {
  title: "Surface preview",
  description: "Find trending repos before the rest of the internet does.",
};

interface Tile {
  num: string;
  href: string;
  badge: string;
  route: string;
  title: string;
  desc: string;
  foot: string;
  previewVariant: PreviewVariant;
}

const PREVIEW_RENDERERS: Record<PreviewVariant, () => React.ReactElement> = {
  trending: PvTrending,
  breakout: PvBreakout,
  signals: PvSignals,
  detail: PvDetail,
  account: PvAccount,
  drop: PvDrop,
  tools: PvTools,
  money: PvMoney,
  m2m: PvM2M,
  mrr: PvMrr,
  ideas: PvIdeas,
  build: PvBuild,
};

const RIGHT_ARROW = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M3 8h10m-3-3l3 3-3 3" />
  </svg>
);

export default async function PreviewPage() {
  // trackedRepos + counts + ideasOpen are independent reads. Parallelize so
  // cold loads don't serialize three round-trips.
  const [, counts, ideasOpen] = await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    getSidebarSourceCounts().catch(() => null),
    listIdeas()
      .then((rows) => rows.filter((i) => i.status === "published").length)
      .catch(() => 0),
  ]);

  const trackedRepos = safe(() => getTrackedRepoCount(), 0);
  const mentions24h = counts
    ? counts.hackernewsStories +
      counts.lobstersStories +
      counts.devtoArticles +
      counts.blueskyPosts +
      counts.redditPosts +
      counts.producthuntLaunches
    : 0;

  const tiles: Tile[] = [
    {
      num: "01",
      href: "/",
      badge: "01 · ENTRY",
      route: "/",
      title: "Trending hub · 5-way switcher",
      desc:
        "Repos · Skills · MCP servers · Agents · LLMs (HF merged in). Mention-source pip strip per row, top movers rail, source-health gauge.",
      foot: `${trackedRepos.toLocaleString()} candidates · 30 mention sources`,
      previewVariant: "trending",
    },
    {
      num: "02",
      href: "/breakout",
      badge: "02 · RADAR",
      route: "/breakout",
      title: "Breakout radar · velocity-weighted",
      desc:
        "Velocity × consensus bubble map. Hot/warm/early/emerging tiers. 'Why this is breakout' reasoning per repo.",
      foot: "Tier heat + bubble map + breakout list",
      previewVariant: "breakout",
    },
    {
      num: "03",
      href: "/market-signals",
      badge: "03 · COCKPIT",
      route: "/market-signals",
      title: "Market signals · merged cockpit",
      desc:
        "30-source filter rail, 30d volume area chart, cross-source mention feed (5+ sources), tag-momentum heatmap, NPM accelerating, arXiv papers + linked repos.",
      foot: `${mentions24h.toLocaleString()} mentions in surface`,
      previewVariant: "signals",
    },
    {
      num: "04",
      href: "/repo/vercel/next.js",
      badge: "04 · KEY",
      route: "/repo/[owner]/[name]",
      title: "Repo detail · the profile",
      desc:
        "Hero star-history chart with release + mention markers. Mentions by source (GH · HN · Reddit · X). 30-day mention timeline. Why-trending narrative.",
      foot: "Hero chart + 4 src + timeline",
      previewVariant: "detail",
    },
    {
      num: "05",
      href: "/account",
      badge: "05 · YOU",
      route: "/account",
      title: "Account · the collective",
      desc:
        "Identity hero + plan card. Watchlist preview, alert inbox, referrals + leaderboard, API keys, drops queue, full activity timeline.",
      foot: "Watchlist · alerts · refs · drops",
      previewVariant: "account",
    },
    {
      num: "06",
      href: "/drop",
      badge: "06 · SUBMIT",
      route: "/drop",
      title: "Drop a repo · premium submit",
      desc:
        "4-step flow: URL → preview → categorize → submit. Live metadata fetch, cross-source pre-scan, review score, promotion readiness indicator.",
      foot: "4-step · auto-fetch · live preview",
      previewVariant: "drop",
    },
    {
      num: "07",
      href: "/tools",
      badge: "07 · TOOLS",
      route: "/tools",
      title: "Tools · toolbox hub",
      desc:
        "Star History · Treemap · Watchlist · Compare · Tier List · Top 10 · Digest · Ideas · Revenue Estimate. The analyst's workbench.",
      foot: "9 utilities · charts · estimators",
      previewVariant: "tools",
    },
    {
      num: "08",
      href: "/funding",
      badge: "08 · MONEY",
      route: "/funding",
      title: "Funding · capital flows",
      desc:
        "Live tape from TechCrunch, VentureBeat, Sifted, Crunchbase, SEC Form D and 30+ more. Top rounds + sector heatmap + investor leaderboards.",
      foot: "Tape · sector heatmap · investors",
      previewVariant: "money",
    },
    {
      num: "09",
      href: "/agent-commerce",
      badge: "09 · M2M",
      route: "/agent-commerce",
      title: "Agent Commerce · M2M economy",
      desc:
        "x402 + MCP + a2a protocols. On-chain settlements (Base + Solana via Dune). Token gainers/losers, composite movers, portal-ready APIs.",
      foot: "Base · Solana · 87 x402 endpoints",
      previewVariant: "m2m",
    },
    {
      num: "10",
      href: "/revenue",
      badge: "10 · MRR",
      route: "/revenue",
      title: "Revenue · TrustMRR terminal",
      desc:
        "Verified MRR via read-only sync with Stripe / Lemon Squeezy / Paddle. Tracked OSS-matched cards up top. Founder profile attribution.",
      foot: "TrustMRR · OSS matched cards",
      previewVariant: "mrr",
    },
    {
      num: "11",
      href: "/ideas",
      badge: "11 · NEW",
      route: "/ideas",
      title: "Ideas · opportunity board",
      desc:
        "A direct board of buildable opportunities from repo trends, gaps, and developer demand. Search, filter, claim, save, generate concise briefs.",
      foot: `${ideasOpen} open · 3 modals · reactions + comments`,
      previewVariant: "ideas",
    },
    {
      num: "12",
      href: "/build",
      badge: "12 · NEW",
      route: "/build",
      title: "Build · repo update workflow",
      desc:
        "Working product dashboard for selecting a repo, reviewing detected signals, editing suggested updates, and publishing to a project timeline.",
      foot: "Repo selector · signals · review panel",
      previewVariant: "build",
    },
  ];

  return (
    <>
      <section className="lnch-hero">
        <div className="lnch-eyebrow">
          <span className="live-dot" /> new UI · {tiles.length} surfaces · responsive
        </div>
        <h1 className="lnch-title">
          Find <span className="accent">trending repos</span> before the rest of
          the internet does.
        </h1>
        <p className="lnch-sub">
          TrendingRepo is the AI repo intelligence terminal. Track{" "}
          <b>{trackedRepos.toLocaleString()}</b> repos across <b>30</b> mention
          sources. Surface breakouts before mainstream. Then turn signal into
          action — claim a build idea, attach a repo, ship to a curated
          audience.
        </p>
        <div className="lnch-stats">
          <span className="seg">
            <b>{trackedRepos.toLocaleString()}</b> repos tracked
          </span>
          <span className="seg">
            <b>30</b> mention sources
          </span>
          <span className="seg">
            <b>{mentions24h.toLocaleString()}</b> mentions / 24h
          </span>
          <span className="seg">
            <b>{ideasOpen}</b> open build ideas
          </span>
          <span className="seg">
            <b>responsive</b> mobile→4K
          </span>
        </div>
      </section>

      <div className="lnch-grid">
        {tiles.map((t) => {
          const Renderer = PREVIEW_RENDERERS[t.previewVariant];
          return (
            <Link key={t.num} href={t.href} className="scrn-card">
              <Renderer />
              <div className="scrn-body">
                <div className="scrn-meta">
                  <span className="badge">{t.badge}</span>
                  <span>{t.route}</span>
                </div>
                <h2 className="scrn-name">{t.title}</h2>
                <p className="scrn-desc">{t.desc}</p>
              </div>
              <div className="scrn-foot">
                <span>{t.foot}</span>
                <span className="open">Open {RIGHT_ARROW}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
