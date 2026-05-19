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
        <span className="brand-mark">▲</span>
        <span className="brand-name">
          TRENDING<span className="accent-text">REPO</span>
        </span>
      </Link>

      <div className="nav-group">
        <div className="nav-label">Discover</div>
        <div className="nav-parent" data-nav-parent>
          <NavLink href="/" className="" pill={String(childTotal || 5)}>
            <span className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 14L6 9L9 12L14 5" />
                <circle cx="14" cy="5" r="1.5" fill="currentColor" />
              </svg>
            </span>
            <span>Trending</span>
            <svg className="nav-caret" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 5l3 3 3-3" />
            </svg>
          </NavLink>
          <div className="nav-children">
            <div>
              <Link className="nav-child" href="/#repos">
                <span className="child-icon">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 13V3h7l3 3v7" />
                    <path d="M10 3v3h3" />
                  </svg>
                </span>
                <span>Repos</span>
                <span className="child-count">{repoCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#skills">
                <span className="child-icon">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M8 2L3 5v5l5 3 5-3V5l-5-3z" />
                  </svg>
                </span>
                <span>Skills</span>
                <span className="child-count">{skillsCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#mcp">
                <span className="child-icon">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="3" cy="3" r="1.5" />
                    <circle cx="13" cy="3" r="1.5" />
                    <circle cx="3" cy="13" r="1.5" />
                    <circle cx="13" cy="13" r="1.5" />
                  </svg>
                </span>
                <span>MCP Servers</span>
                <span className="child-count">{mcpCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#agents">
                <span className="child-icon">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="8" cy="6" r="3" />
                    <path d="M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" />
                  </svg>
                </span>
                <span>Agents</span>
                <span className="child-count">{agentsCount.toLocaleString()}</span>
              </Link>
              <Link className="nav-child" href="/#llms">
                <span className="child-icon">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
                    <path d="M5 8h6M8 5v6" />
                  </svg>
                </span>
                <span>LLMs · HF</span>
                <span className="child-count">{llmsCount.toLocaleString()}</span>
              </Link>
            </div>
          </div>
        </div>

        <NavLink href="/breakout">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 14V8m0 0L5 11m3-3l3 3M3 6l5-4 5 4" />
            </svg>
          </span>
          <span>Breakout</span>
        </NavLink>
        <NavLink href="/market-signals">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12V8m4 4V4m4 8v-6m4 6V2" />
            </svg>
          </span>
          <span>Market Signals</span>
        </NavLink>
        <NavLink href="/funding">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6" />
              <path d="M5 8h6m-3-3v6" />
            </svg>
          </span>
          <span>Funding</span>
        </NavLink>
        <NavLink href="/revenue">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 13l4-4 3 3 5-7" />
              <path d="M9 5h4v4" />
            </svg>
          </span>
          <span>Revenue</span>
        </NavLink>
        <NavLink href="/agent-commerce" prefetch={false}>
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
              <path d="M2.5 6h11M6 2.5v11" />
            </svg>
          </span>
          <span>Agent Commerce</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Tools</div>
        <NavLink href="/tools">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
            </svg>
          </span>
          <span>All Tools</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Builder</div>
        <NavLink href="/ideas" pill="NEW">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 2" />
            </svg>
          </span>
          <span>Ideas</span>
        </NavLink>
        <NavLink href="/build" pill="NEW">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 13L8 3l5 10M5.5 10h5" />
            </svg>
          </span>
          <span>Build</span>
        </NavLink>
      </div>

      <div className="nav-group">
        <div className="nav-label">Account</div>
        <NavLink href="/account">
          <span className="nav-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="5" r="2.5" />
              <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
            </svg>
          </span>
          <span>Profile</span>
        </NavLink>
      </div>

      <Link className="sidebar-drop" href="/drop">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 3v10m0 0l-4-4m4 4l4-4M3 17h14" />
        </svg>
        <div>
          <b>Drop a repo</b>
          <br />
          <span style={{ fontSize: "10.5px", color: "var(--fg-faint)" }}>Surface yours · 30s</span>
        </div>
      </Link>

      <div className="upgrade-card">
        <div className="uc-eyebrow">▲ UNLOCK TRENDINGREPO</div>
        <div className="uc-pitch">
          Smart alerts, <b>6-way compare</b>, full 5-yr history, RSS/webhook feeds, CSV export, API access.
        </div>
        <Link className="uc-cta" href="/account?tab=billing">
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
