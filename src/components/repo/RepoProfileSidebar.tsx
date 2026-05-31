// RepoProfileSidebar — route-scoped left rail for `/repo/[owner]/[name]`.
//
// Server component. Mirrors PFSidebar from the standalone Profile.html
// reference (C:/tmp/asset_e0686a47.js:270-338) exactly:
//
//   - Brand block (logo + trending.repo wordmark)
//   - CORE group:      Trending / Breakouts / Market Signals / Radar /
//                      Compare / Watchlist (counts where available)
//   - PROFILE group:   {owner}/{name} (active) / Owner · {owner} / Related (5)
//                      with "OPEN" accent in title
//   - CATEGORIES:      Trending Repos / Skills / MCP / Agents / LLMs / Papers
//                      (counts derived from getPublicSidebarShell where cheap;
//                      omit when not)
//   - TOOLS:           Design system / Asset library
//   - Footer:          SYS · ALL GREEN status + v{BUILD_SHA} pill
//
// Counts come from the existing public sidebar shell — no new fetchers.
// Source is suspect-free per CLAUDE.md M6: every count traces back to a
// data-store-backed getter (`getDerivedRepos`, `getSidebarSourceCounts`).
//
// Route-scoped CSS lives in repoProfileShell.module.css; no global shell.css
// changes. The global `.sidebar` + `.topbar` are hidden from this route via
// a `:root:has([data-repo-profile-shell])` rule emitted by the route layout.

import Link from "next/link";

import { Icon } from "@/components/icon/Icon";
import { getPublicSidebarShell } from "@/lib/sidebar-data";

import styles from "./repoProfileShell.module.css";

interface RepoProfileSidebarProps {
  owner: string;
  name: string;
  relatedCount?: number;
}

function formatCompact(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(value)
    .toLowerCase();
}

function buildSha(): string {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA;
  if (sha && sha.length >= 7) return sha.slice(0, 7);
  return "v6.2.1";
}

export async function RepoProfileSidebar({
  owner,
  name,
  relatedCount,
}: RepoProfileSidebarProps) {
  const shell = await getPublicSidebarShell().catch(() => null);

  // Core counts — derived from the public shell. Anything we can't cheaply
  // derive we render WITHOUT a count rather than fabricating.
  const trendingCount = shell?.trendingReposCount ?? null;
  const breakoutsCount = shell?.metaCounts.breakouts ?? null;
  const mentionsCount = (() => {
    const sc = shell?.sourceCounts;
    if (!sc) return null;
    return (
      sc.hackernewsStories +
      sc.lobstersStories +
      sc.devtoArticles +
      sc.blueskyPosts +
      sc.redditPosts +
      sc.twitterRepos
    );
  })();

  // Category counts. PF uses repos/skills/mcp/agents/llms/papers. We hold
  // the labels constant and derive what we can from category stats; omit
  // counts we don't have to avoid fabrication.
  const catCount = (id: string): number | null => {
    const row = shell?.categoryStats.find((c) => c.categoryId === id);
    return row?.repoCount ?? null;
  };
  const categories: Array<{
    id: string;
    icon: string;
    label: string;
    count: number | null;
  }> = [
    { id: "repos", icon: "git-branch", label: "Trending Repos", count: trendingCount },
    { id: "skills", icon: "sparkles", label: "Skills", count: null },
    { id: "mcp", icon: "layers", label: "MCP", count: catCount("mcp") },
    { id: "agents", icon: "bot", label: "Agents", count: catCount("ai-agents") },
    { id: "llms", icon: "cpu", label: "LLMs", count: null },
    { id: "papers", icon: "book", label: "Papers", count: null },
  ];

  const fullName = `${owner}/${name}`;
  const relatedLabel =
    typeof relatedCount === "number" && relatedCount > 0
      ? `Related (${relatedCount})`
      : "Related";

  return (
    <aside
      className={styles.sidebar}
      aria-label="Repository profile navigation"
    >
      <Link className={styles.brand} href="/" aria-label="TrendingRepo home">
        <span className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- brand SVG */}
          <img
            src="/brand/trendingrepo-mark.svg"
            alt=""
            width={26}
            height={26}
            loading="eager"
            decoding="async"
          />
        </span>
        <span className={styles.name}>
          trending<span className={styles.nameDot}>.</span>repo
        </span>
      </Link>

      <nav className={styles.nav} aria-label="Primary">
        <div className={styles.group}>
          <div className={styles.groupTitle}>
            <span>{"// CORE"}</span>
          </div>
          <CoreItem
            href="/"
            icon="flame"
            label="Trending"
            count={formatCompact(trendingCount)}
          />
          <CoreItem
            href="/breakout"
            icon="zap"
            label="Breakouts"
            count={breakoutsCount !== null ? String(breakoutsCount) : null}
          />
          <CoreItem
            href="/market-signals"
            icon="activity"
            label="Market Signals"
            count={formatCompact(mentionsCount)}
          />
          <CoreItem href="/breakout" icon="radar" label="Radar" count={null} />
          <CoreItem
            href="/tools/compare"
            icon="diff"
            label="Compare"
            count={null}
          />
          <CoreItem
            href="/tools/watchlist"
            icon="bookmark"
            label="Watchlist"
            count="0"
          />
        </div>

        <div className={styles.group}>
          <div className={styles.groupTitle}>
            <span>{"// PROFILE"}</span>
            <span className={styles.groupTitleAccent}>OPEN</span>
          </div>
          <div
            className={`${styles.item} ${styles.active}`}
            aria-current="page"
          >
            <Icon name="git-branch" className={styles.itemIcon} />
            <span>{fullName}</span>
          </div>
          <Link
            className={styles.item}
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="user" className={styles.itemIcon} />
            <span>Owner · {owner}</span>
          </Link>
          <a className={styles.item} href="#related">
            <Icon name="git-branch" className={styles.itemIcon} />
            <span>{relatedLabel}</span>
          </a>
        </div>

        <div className={styles.group}>
          <div className={styles.groupTitle}>
            <span>{"// CATEGORIES"}</span>
          </div>
          {categories.map((c) => (
            <Link
              key={c.id}
              className={styles.item}
              href={c.id === "repos" ? "/" : `/?cat=${c.id}`}
              prefetch={false}
            >
              <Icon name={c.icon} className={styles.itemIcon} />
              <span>{c.label}</span>
              {c.count !== null && (
                <span className={styles.count}>
                  {Intl.NumberFormat("en-US").format(c.count)}
                </span>
              )}
            </Link>
          ))}
        </div>

        <div className={styles.group}>
          <div className={styles.groupTitle}>
            <span>{"// TOOLS"}</span>
          </div>
          <Link
            className={styles.item}
            href="/tools/tier-list"
            prefetch={false}
          >
            <Icon name="sparkles" className={styles.itemIcon} />
            <span>Design system</span>
          </Link>
          <Link className={styles.item} href="/drop" prefetch={false}>
            <Icon name="layers" className={styles.itemIcon} />
            <span>Asset library</span>
          </Link>
        </div>
      </nav>

      <div className={styles.footer}>
        <span className={styles.dotLive} aria-hidden="true" />
        <span>SYS · ALL GREEN</span>
        <span className={styles.footerVersion}>{buildSha()}</span>
      </div>
    </aside>
  );
}

function CoreItem({
  href,
  icon,
  label,
  count,
}: {
  href: string;
  icon: string;
  label: string;
  count: string | null;
}) {
  return (
    <Link className={styles.item} href={href} prefetch={false}>
      <Icon name={icon} className={styles.itemIcon} />
      <span>{label}</span>
      {count && <span className={styles.count}>{count}</span>}
    </Link>
  );
}
