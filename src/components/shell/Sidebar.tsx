// Sidebar — global left rail. Server component.
// Emits shell.css `.sidebar` markup with nav structure, drop-CTA, upgrade card,
// footer with live pulse dot.
// Active link state computed client-side by <NavLink>.

import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { classifyFreshness } from "@/lib/news/freshness";
import { getLastFetchedAt } from "@/lib/trending";
import Link from "next/link";
import { NavLink } from "./NavLink";
import {
  TrendingUp,
  Sparkles,
  Activity,
  CircleDollarSign,
  User,
  Download,
  Zap,
} from "@/lib/icons";
import {
  Store,
  Bookmark,
  ListOrdered,
  LineChart,
  Layers,
  GitCompare,
  AtSign,
} from "lucide-react";

export async function Sidebar() {
  const counts = await getSidebarSourceCounts().catch(() => null);
  const lastFetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();
  const fresh = lastFetchedAt ? classifyFreshness("repos", lastFetchedAt) : null;

  return (
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="TrendingRepo home">
        <span className="brand-mark brand-mark--image">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG, no Next/Image optimization */}
          <img src="/brand/trendingrepo.svg" alt="" width={24} height={24} loading="eager" decoding="async" />
        </span>
        <span className="brand-name">
          trending<span className="dot">.</span>repo
        </span>
      </Link>

      <div className="nav-group">
        <div className="nav-label">Discover</div>
        <NavLink href="/">
          <span className="nav-icon">
            <TrendingUp size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Trending</span>
        </NavLink>
        <NavLink href="/breakout">
          <span className="nav-icon">
            <Zap size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Breakout</span>
        </NavLink>
        <NavLink href="/tools/watchlist" prefetch={false}>
          <span className="nav-icon">
            <Bookmark size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Watchlist</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Tools</div>
        {/* Tertiary nav — disable prefetch so we don't fan out 4 extra RSC
            payload fetches when the user hovers the sidebar. */}
        <NavLink href="/tools/top-10" prefetch={false}>
          <span className="nav-icon">
            <ListOrdered size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Top 10</span>
        </NavLink>
        <NavLink href="/tools/star-history" prefetch={false}>
          <span className="nav-icon">
            <LineChart size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Star History</span>
        </NavLink>
        <NavLink href="/tools/tier-list" prefetch={false}>
          <span className="nav-icon">
            <Layers size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Tier List</span>
        </NavLink>
        <NavLink href="/tools/compare" prefetch={false}>
          <span className="nav-icon">
            <GitCompare size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Compare</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Market</div>
        <NavLink href="/market-signals">
          <span className="nav-icon">
            <AtSign size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Mentions</span>
        </NavLink>
        <NavLink href="/funding">
          <span className="nav-icon">
            <CircleDollarSign size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Funding</span>
        </NavLink>
        <NavLink href="/revenue">
          <span className="nav-icon">
            <TrendingUp size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Revenue</span>
        </NavLink>
        <NavLink href="/agent-commerce" prefetch={false}>
          <span className="nav-icon">
            <Store size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Agent Commerce</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Account</div>
        <NavLink href="/account" prefetch={false}>
          <span className="nav-icon">
            <User size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Profile</span>
        </NavLink>
      </div>

      <Link className="sidebar-drop" href="/drop" prefetch={false}>
        <Download size={20} strokeWidth={1.6} aria-hidden="true" />
        <div>
          <b>Drop a repo</b>
          <br />
          <span style={{ fontSize: "10.5px", color: "var(--fg-faint)" }}>Surface yours · 30s</span>
        </div>
      </Link>

      <div className="upgrade-card">
        <div className="uc-eyebrow">
          <Sparkles size={11} strokeWidth={1.8} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
          UNLOCK TRENDINGREPO
        </div>
        <div className="uc-pitch">
          Smart alerts, <b>6-way compare</b>, full 5-yr history, RSS/webhook feeds, CSV export, API access.
        </div>
        <Link className="uc-cta" href="/account?tab=billing" prefetch={false}>
          Go PRO · $19/mo
        </Link>
        <div className="uc-price">or Team $49/mo · 7 seats</div>
      </div>

      <div className="sidebar-footer">
        <div className="row">
          <span className="pulse" />
          <span className="mono">PIPE · LIVE</span>
        </div>
        <div className="row between">
          <span>Last scan</span>
          <span className="mono">{fresh?.ageLabel ?? "—"}</span>
        </div>
        <div className="row between">
          <span>Mention sources</span>
          <span className="mono accent-text">{sumActiveSources(counts)} live</span>
        </div>
      </div>
    </aside>
  );
}

function sumActiveSources(counts: import("@/lib/sidebar-source-counts").SidebarSourceCounts | null): string {
  if (!counts) return "—";
  // Heuristic: count any signal source with non-zero items as "live".
  const sources = [
    counts.hackernewsStories,
    counts.lobstersStories,
    counts.devtoArticles,
    counts.blueskyPosts,
    counts.redditPosts,
    counts.producthuntLaunches,
    counts.fundingSignals,
    counts.npmPackages,
    counts.agentRepos,
    counts.twitterRepos,
    counts.hfModels,
    counts.arxivPapers,
  ];
  const live = sources.filter((n) => n > 0).length;
  return `${live} / ${sources.length}`;
}
