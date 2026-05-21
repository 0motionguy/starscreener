// Sidebar — global left rail. Server component.
// Emits shell.css `.sidebar` markup with nav structure, drop-CTA, upgrade card,
// footer with live pulse dot.
// Active link state computed client-side by <NavLink>.

import { getSidebarSourceCounts } from "@/lib/sidebar-source-counts";
import { getDerivedRepoCount } from "@/lib/derived-repos";
import { getTrackedRepoCount } from "@/lib/trending";
import { classifyFreshness } from "@/lib/news/freshness";
import { getLastFetchedAt } from "@/lib/trending";
import Link from "next/link";
import { NavLink } from "./NavLink";
import {
  TrendingUp,
  FileText,
  Sparkles,
  Users,
  Activity,
  CircleDollarSign,
  Eye,
  Lightbulb,
  BarChart3,
  User,
  Download,
  Zap,
} from "@/lib/icons";
import { Network, Cpu, Store, LayoutGrid, ChevronDown } from "lucide-react";

export async function Sidebar() {
  const counts = await getSidebarSourceCounts().catch(() => null);
  const trackedCount = (() => {
    try {
      return getTrackedRepoCount();
    } catch {
      return 0;
    }
  })();
  const derivedCount = (() => {
    try {
      return getDerivedRepoCount();
    } catch {
      return 0;
    }
  })();
  const lastFetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();
  const fresh = lastFetchedAt ? classifyFreshness("repos", lastFetchedAt) : null;

  const repoCount = Math.max(trackedCount, derivedCount);
  const skillsCount = counts?.skillsItems ?? 0;
  const mcpCount = counts?.mcpItems ?? 0;
  const agentsCount = counts?.agentRepos ?? 0;
  const llmsCount = (counts?.hfModels ?? 0) + (counts?.hfDatasets ?? 0) + (counts?.hfSpaces ?? 0);
  const childTotal =
    (repoCount > 0 ? 1 : 0) +
    (skillsCount > 0 ? 1 : 0) +
    (mcpCount > 0 ? 1 : 0) +
    (agentsCount > 0 ? 1 : 0) +
    (llmsCount > 0 ? 1 : 0);

  return (
    <aside className="sidebar">
      <Link className="logo" href="/">
        <span className="brand-mark"><TrendingUp size={14} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="brand-name">
          TRENDING<span className="accent-text">REPO</span>
        </span>
      </Link>

      <div className="nav-group">
        <div className="nav-label">Discover</div>
        <div className="nav-parent" data-nav-parent>
          <NavLink href="/" className="" pill={String(childTotal || 5)}>
            <span className="nav-icon">
              <TrendingUp size={16} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span>Trending</span>
            <ChevronDown className="nav-caret" size={12} strokeWidth={1.6} aria-hidden="true" />
          </NavLink>
          <div className="nav-children">
            <div>
              <Link className="nav-child" href="/#repos">
                <span className="child-icon">
                  <FileText size={13} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span>Repos</span>
                <span className="child-count">{repoCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#skills">
                <span className="child-icon">
                  <Sparkles size={13} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span>Skills</span>
                <span className="child-count">{skillsCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#mcp">
                <span className="child-icon">
                  <Network size={13} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span>MCP Servers</span>
                <span className="child-count">{mcpCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#agents">
                <span className="child-icon">
                  <Users size={13} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span>Agents</span>
                <span className="child-count">{agentsCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#llms">
                <span className="child-icon">
                  <Cpu size={13} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span>LLMs · HF</span>
                <span className="child-count">{llmsCount.toLocaleString()}</span>
              </Link>
            </div>
          </div>
        </div>

        <NavLink href="/breakout">
          <span className="nav-icon">
            <Zap size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Breakout</span>
        </NavLink>
        <NavLink href="/market-signals">
          <span className="nav-icon">
            <Activity size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Market Signals</span>
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
        <div className="nav-label">Tools</div>
        {/* Tertiary nav — disable prefetch so a single trending hub
            view doesn't fan out 5+ extra RSC payload fetches on hover. */}
        <NavLink href="/tools" prefetch={false}>
          <span className="nav-icon">
            <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>All Tools</span>
        </NavLink>
        <NavLink href="/preview" pill="NEW" prefetch={false}>
          <span className="nav-icon">
            <Eye size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Surface preview</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Builder</div>
        <NavLink href="/ideas" pill="NEW" prefetch={false}>
          <span className="nav-icon">
            <Lightbulb size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Ideas</span>
        </NavLink>
        <NavLink href="/build" pill="NEW" prefetch={false}>
          <span className="nav-icon">
            <BarChart3 size={16} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Build</span>
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
    counts.skillsItems,
    counts.mcpItems,
    counts.agentRepos,
    counts.twitterRepos,
    counts.hfModels,
    counts.arxivPapers,
  ];
  const live = sources.filter((n) => n > 0).length;
  return `${live} / ${sources.length}`;
}
