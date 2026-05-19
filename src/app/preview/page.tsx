// /preview — launcher tile grid showing every rebuilt route at a glance.
// Maps to the prototype index. Public, low data weight.

import Link from "next/link";
import { refreshTrendingFromStore, getTrackedRepoCount } from "@/lib/trending";
import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { listIdeas } from "@/lib/ideas";

export const revalidate = 3600;

export const metadata = {
  title: "TrendingRepo · surface preview",
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
}

export default async function PreviewPage() {
  await refreshTrendingFromStore().catch(() => undefined);

  const trackedRepos = safe(() => getTrackedRepoCount(), 0);
  const counts = await getSidebarSourceCounts().catch(() => null);
  const mentions24h = counts
    ? counts.hackernewsStories +
      counts.lobstersStories +
      counts.devtoArticles +
      counts.blueskyPosts +
      counts.redditPosts +
      counts.producthuntLaunches
    : 0;
  const ideasOpen = await listIdeas()
    .then((rows) => rows.filter((i) => i.status === "published").length)
    .catch(() => 0);

  const tiles: Tile[] = [
    {
      num: "01",
      href: "/",
      badge: "01 · ENTRY",
      route: "/",
      title: "Trending hub · 5-way switcher",
      desc: "Repos · Skills · MCP servers · Agents · LLMs (HF merged in). Mention-source pip strip per row, top movers rail, source-health gauge.",
      foot: `${trackedRepos.toLocaleString()} candidates · 30 mention sources`,
    },
    {
      num: "02",
      href: "/breakout",
      badge: "02 · RADAR",
      route: "/breakout",
      title: "Breakout radar · velocity-weighted",
      desc: "Velocity × consensus bubble map. Hot/warm/early/emerging tiers. 'Why this is breakout' reasoning per repo.",
      foot: "Tier heat + bubble map + breakout list",
    },
    {
      num: "03",
      href: "/market-signals",
      badge: "03 · COCKPIT",
      route: "/market-signals",
      title: "Market signals · merged cockpit",
      desc: "30-source filter rail, 30d volume area chart, cross-source mention feed (5+ sources), tag-momentum heatmap, NPM accelerating, arXiv papers + linked repos.",
      foot: `${mentions24h.toLocaleString()} mentions in surface`,
    },
    {
      num: "04",
      href: "/repo/vercel/next.js",
      badge: "04 · KEY",
      route: "/repo/[owner]/[name]",
      title: "Repo detail · the profile",
      desc: "Hero star-history chart with release + mention markers. Mentions by source (GH · HN · Reddit · X). 30-day mention timeline. Why-trending narrative.",
      foot: "Hero chart + 4 src + timeline",
    },
    {
      num: "05",
      href: "/account",
      badge: "05 · YOU",
      route: "/account",
      title: "Account · the collective",
      desc: "Identity hero + plan card. Watchlist preview, alert inbox, referrals + leaderboard, API keys, drops queue, full activity timeline.",
      foot: "Watchlist · alerts · refs · drops",
    },
    {
      num: "06",
      href: "/drop",
      badge: "06 · SUBMIT",
      route: "/drop",
      title: "Drop a repo · premium submit",
      desc: "4-step flow: URL → preview → categorize → submit. Live metadata fetch, cross-source pre-scan, projected score, promote-probability indicator.",
      foot: "4-step · auto-fetch · live preview",
    },
    {
      num: "07",
      href: "/tools",
      badge: "07 · TOOLS",
      route: "/tools",
      title: "Tools · toolbox hub",
      desc: "Star History · Treemap · Watchlist · Compare · Tier List · Top 10 · Digest · Ideas · Revenue Estimate. The analyst's workbench.",
      foot: "9 utilities · charts · estimators",
    },
    {
      num: "08",
      href: "/funding",
      badge: "08 · MONEY",
      route: "/funding",
      title: "Funding · capital flows",
      desc: "Live tape from TechCrunch, VentureBeat, Sifted, Crunchbase, SEC Form D and 30+ more. Top rounds + sector heatmap + investor leaderboards.",
      foot: "Tape · sector heatmap · investors",
    },
    {
      num: "09",
      href: "/agent-commerce",
      badge: "09 · M2M",
      route: "/agent-commerce",
      title: "Agent Commerce · M2M economy",
      desc: "x402 + MCP + a2a protocols. On-chain settlements (Base + Solana via Dune). Token gainers/losers, composite movers, portal-ready APIs.",
      foot: "Base · Solana · 87 x402 endpoints",
    },
    {
      num: "10",
      href: "/revenue",
      badge: "10 · MRR",
      route: "/revenue",
      title: "Revenue · TrustMRR terminal",
      desc: "Verified MRR via read-only sync with Stripe / Lemon Squeezy / Paddle. Tracked OSS-matched cards up top. Founder profile attribution.",
      foot: "TrustMRR · OSS matched cards",
    },
    {
      num: "11",
      href: "/ideas",
      badge: "11 · NEW",
      route: "/ideas",
      title: "Ideas · opportunity board",
      desc: "A direct board of buildable opportunities from repo trends, gaps, and developer demand. Search, filter, claim, save, generate concise briefs.",
      foot: `${ideasOpen} open · 3 modals · reactions + comments`,
    },
    {
      num: "12",
      href: "/build",
      badge: "12 · NEW",
      route: "/build",
      title: "Build · repo update workflow",
      desc: "Working product dashboard for selecting a repo, reviewing detected signals, editing suggested updates, and publishing to a project timeline.",
      foot: "Repo selector · signals · review panel",
    },
  ];

  return (
    <div style={{ padding: "60px 22px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <section style={{ textAlign: "center", maxWidth: 1100, margin: "0 auto 30px", position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--accent)",
            padding: "4px 10px",
            background: "var(--accent-soft)",
            border: "1px solid rgba(255,107,53,0.3)",
            borderRadius: "var(--r-pill)",
            marginBottom: 18,
          }}
        >
          <span className="live-dot live" /> new UI · {tiles.length} surfaces · responsive
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(36px, 5vw, 64px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            margin: "0 0 16px",
            color: "var(--fg-bright)",
          }}
        >
          Find{" "}
          <span
            style={{
              color: "var(--accent)",
            }}
          >
            trending repos
          </span>{" "}
          before the rest of the internet does.
        </h1>
        <p style={{ fontSize: 16, color: "var(--fg-muted)", lineHeight: 1.6, maxWidth: "64ch", margin: "0 auto 24px" }}>
          TrendingRepo is the AI repo intelligence terminal. Track <b>{trackedRepos.toLocaleString()}</b> repos across <b>30</b>{" "}
          mention sources. Surface breakouts before mainstream. Then turn signal into action — claim a build idea, attach a repo,
          ship to a curated audience.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {tiles.map((t) => (
          <Link
            key={t.num}
            href={t.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--r-1)",
              overflow: "hidden",
              transition: "transform var(--d-base) var(--ease), border-color var(--d-base) var(--ease)",
              textDecoration: "none",
              color: "inherit",
            }}
            className="scrn-card"
          >
            <div style={{ padding: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-faint)",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    padding: "2px 7px",
                    borderRadius: "var(--r-pill)",
                    border: "1px solid rgba(255,107,53,0.3)",
                    fontWeight: 600,
                  }}
                >
                  {t.badge}
                </span>
                <span>{t.route}</span>
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 19,
                  lineHeight: 1.1,
                  letterSpacing: "-0.015em",
                  color: "var(--fg-bright)",
                  margin: "0 0 6px",
                }}
              >
                {t.title}
              </h2>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0 }}>{t.desc}</p>
            </div>
            <div
              style={{
                padding: "10px 18px",
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--graphite)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--fg-faint)",
              }}
            >
              <span>{t.foot}</span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>Open →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
