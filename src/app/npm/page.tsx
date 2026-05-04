// /npm — V4 SourceFeedTemplate consumer.
//
// npm is registry adoption telemetry, not a news/social mention source. The
// scraper discovers package candidates, keeps only rows whose metadata links
// to GitHub, then ranks 24h/7d/30d. Template renders PageHead + KpiBand
// snapshot + list slot; existing window TabNav + PackageFeed table render
// inside the list slot unchanged.

import type { Metadata } from "next";
import Link from "next/link";
import {
  deltaForNpmWindow,
  deltaPctForNpmWindow,
  downloadsForNpmWindow,
  getNpmCold,
  getNpmPackagesFile,
  getTopNpmPackages,
  refreshNpmFromStore,
  type NpmPackageRow,
  type NpmWindow,
} from "@/lib/npm";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { npmLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

// npm brand red — no --v4-src-npm token exists in v4.css yet, so we hardcode
// it once on the KpiBand pip and reuse the same hex for the active-tab
// underline + accents below. Everything else stays tokenized via var(--v4-*).
const NPM_RED = "#cb3837";

const WINDOWS: NpmWindow[] = ["24h", "7d", "30d"];
const DEFAULT_WINDOW: NpmWindow = "24h";

// ISR with 10-min revalidate. Each `?range=...` variant gets its own
// cache entry (ISR keys by URL incl. query string), so window switching
// still works without paying full SSR per hit.
export const revalidate = 600;

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "NPM Trending Packages",
  description:
    "Top npm package movement over 24h, 7d, and 30d windows, filtered to packages with GitHub repositories attached.",
  alternates: { canonical: "/npm" },
  openGraph: {
    title: "NPM Trending — TrendingRepo",
    description:
      "Top npm package movement across 24h / 7d / 30d windows. Filter to packages with attached GitHub repos and live momentum.",
    url: "/npm",
    type: "website",
  },
};

interface NpmPageProps {
  searchParams: Promise<{ range?: string | string[] }>;
}

function parseWindow(raw: string | string[] | undefined): NpmWindow {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return (WINDOWS as readonly string[]).includes(candidate ?? "")
    ? (candidate as NpmWindow)
    : DEFAULT_WINDOW;
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}

function formatSignedCompact(n: number): string {
  const formatted = formatCompact(Math.abs(n));
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `-${formatted}`;
  return "0";
}

function formatDeltaPct(n: number | null | undefined): string {
  const value = Number(n) || 0;
  const formatted = `${Math.abs(value).toFixed(1)}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return "0.0%";
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

// npm registry descriptions are scraped from the package's README and often
// arrive as raw HTML/markdown — `<p align="center">`, `<code>`, badge image
// links, etc. Strip the noise so the Package cell renders as a clean one-line
// blurb instead of `<p><code>npm i -g X</code>...`. Length clamp matches the
// truncate width so the trailing ellipsis lines up with the column edge.
function cleanDescription(raw: string | null): string {
  if (!raw) return "repo-linked npm package";
  const stripped = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "repo-linked npm package";
  return stripped.length > 140
    ? `${stripped.slice(0, 137).trimEnd()}…`
    : stripped;
}

export default async function NpmPage({ searchParams }: NpmPageProps) {
  const { range } = await searchParams;
  // Refresh npm-packages cache from the data-store before reading sync getters.
  await refreshNpmFromStore();
  const activeWindow = parseWindow(range);
  const file = getNpmPackagesFile();
  const packages = getTopNpmPackages(activeWindow, 100);
  const cold = getNpmCold() || packages.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>NPM</b> · TERMINAL · /NPM
            </>
          }
          title="npm · top packages"
          lede="Top npm package movement over 24h, 7d, and 30d windows. Discovery sweep keeps only packages whose registry metadata links back to a GitHub repo, then ranks by download velocity."
        />
        <ColdState />
      </main>
    );
  }

  // KpiBand snapshot — tracked packages, top mover for the active window,
  // linked-repo count, active window. Top mover is `packages[0]` because
  // getTopNpmPackages already sorts by trendScore for the active window —
  // ranking a stale legacy library by absolute downloads (the prior
  // behaviour) hid every actual breakout from the snapshot.
  const topMover = packages[0] ?? null;
  const topMoverDelta = topMover ? deltaForNpmWindow(topMover, activeWindow) : 0;
  const topMoverPct = topMover ? deltaPctForNpmWindow(topMover, activeWindow) ?? 0 : 0;
  const linkedRepoCount = packages.filter((pkg) => pkg.linkedRepo).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>NPM</b> · TERMINAL · /NPM
          </>
        }
        title="npm · package velocity"
        lede="Repo-linked npm packages ranked by 24h / 7d / 30d download movement. Every row comes from the fresh npm corpus and links back to its GitHub repo."
        clock={
          <>
            <span className="big">{formatClock(file.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label={`LIVE · ${activeWindow.toUpperCase()}`} />
            <FreshnessBadge source="npm" lastUpdatedAt={file.fetchedAt} />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "TRACKED",
                value: linkedRepoCount.toLocaleString("en-US"),
                sub: "repo-linked pkgs",
                pip: NPM_RED,
              },
              {
                label: `TOP ${activeWindow.toUpperCase()} MOVER`,
                value: topMover ? formatSignedCompact(topMoverDelta) : "—",
                sub: topMover
                  ? `${topMover.name} · ${formatDeltaPct(topMoverPct)}`
                  : "warming",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "LINKED REPOS",
                value: linkedRepoCount.toLocaleString("en-US"),
                sub: "github attached",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "WINDOW",
                value: activeWindow.toUpperCase(),
                sub: "active rank",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow={`Repo-linked packages · top ${packages.length} by ${activeWindow} movement`}
        list={
          <>
            <TabNav active={activeWindow} />
            <PackageFeed packages={packages} activeWindow={activeWindow} />
          </>
        }
      />
    </main>
  );
}

function TabNav({ active }: { active: NpmWindow }) {
  return (
    <nav
      aria-label="npm time windows"
      className="mb-4 flex items-center gap-1 overflow-x-auto scrollbar-hide"
      style={{ borderBottom: "1px solid var(--v4-line-100)" }}
    >
      {WINDOWS.map((window) => {
        const isActive = window === active;
        return (
          <Link
            key={window}
            href={`/npm?range=${window}`}
            aria-current={isActive ? "page" : undefined}
            className="v2-mono inline-flex min-h-[40px] items-center gap-2 px-3 text-[11px] uppercase tracking-[0.18em] whitespace-nowrap transition-colors"
            style={{
              color: isActive ? "var(--v4-ink-100)" : "var(--v4-ink-400)",
              borderBottom: isActive
                ? `2px solid ${NPM_RED}`
                : "2px solid transparent",
            }}
          >
            Top {window}
          </Link>
        );
      })}
    </nav>
  );
}

function PackageFeed({
  packages,
  activeWindow,
}: {
  packages: NpmPackageRow[];
  activeWindow: NpmWindow;
}) {
  const moveLabel = (window: NpmWindow) => `${window.toUpperCase()} Move`;

  const columns: FeedColumn<NpmPackageRow>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? NPM_RED : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "package",
      header: "Package",
      // Under fixedLayout: no explicit width here means this cell takes a
      // share of the leftover after the fixed-width metric/version columns,
      // instead of auto-sizing to the description's nowrap intrinsic width
      // and pushing the move/version cells off the viewport.
      render: (pkg) => <PackageIdentity pkg={pkg} />,
    },
    {
      id: "repo",
      header: "Repo",
      width: "220px",
      hideBelow: "md",
      render: (pkg) => <RepoLink pkg={pkg} />,
    },
    {
      id: "move-24h",
      header: moveLabel("24h"),
      width: "110px",
      align: "right",
      hideBelow: "md",
      render: (pkg) => (
        <Metric
          current={pkg.downloads24h}
          delta={pkg.delta24h}
          deltaPct={pkg.deltaPct24h}
          active={activeWindow === "24h"}
        />
      ),
    },
    {
      id: "move-7d",
      header: moveLabel("7d"),
      width: "110px",
      align: "right",
      hideBelow: "lg",
      render: (pkg) => (
        <Metric
          current={pkg.downloads7d}
          delta={pkg.delta7d}
          deltaPct={pkg.deltaPct7d}
          active={activeWindow === "7d"}
        />
      ),
    },
    {
      id: "move-30d",
      header: moveLabel("30d"),
      width: "110px",
      align: "right",
      hideBelow: "lg",
      render: (pkg) => (
        <Metric
          current={pkg.downloads30d}
          delta={pkg.delta30d}
          deltaPct={pkg.deltaPct30d}
          active={activeWindow === "30d"}
        />
      ),
    },
    {
      id: "active-mobile",
      header: `${activeWindow.toUpperCase()} Move`,
      width: "100px",
      align: "right",
      hideAbove: "md",
      render: (pkg) => (
        <Metric
          current={downloadsForNpmWindow(pkg, activeWindow)}
          delta={deltaForNpmWindow(pkg, activeWindow)}
          deltaPct={deltaPctForNpmWindow(pkg, activeWindow)}
          active
        />
      ),
    },
    {
      id: "version",
      header: "Version",
      width: "100px",
      hideBelow: "lg",
      render: (pkg) => <VersionPill pkg={pkg} />,
    },
  ];

  return (
    <TerminalFeedTable
      rows={packages}
      columns={columns}
      rowKey={(pkg) => pkg.name}
      accent={NPM_RED}
      caption="Top npm packages by download movement, repo-linked only"
      fixedLayout
    />
  );
}

function PackageIdentity({ pkg }: { pkg: NpmPackageRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <EntityLogo
        src={npmLogoUrl(pkg.linkedRepo)}
        name={pkg.linkedRepo ?? pkg.name}
        size={24}
        shape="square"
        alt=""
      />
      <div className="min-w-0">
        <a
          href={pkg.npmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] font-semibold transition-colors hover:text-[color:var(--v4-acc)]"
          style={{ color: "var(--v4-ink-100)" }}
          title={pkg.name}
        >
          {pkg.name}
        </a>
        <div
          className="truncate text-[11px]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {cleanDescription(pkg.description)}
        </div>
      </div>
    </div>
  );
}

function RepoLink({ pkg }: { pkg: NpmPackageRow }) {
  const derived = getDerivedRepoByFullName(pkg.linkedRepo);
  if (derived) {
    return (
      <Link
        href={`/repo/${derived.owner}/${derived.name}`}
        className="block truncate text-xs transition-colors hover:text-[color:var(--v4-acc)]"
        style={{ color: "var(--v4-ink-100)" }}
        title={pkg.linkedRepo}
      >
        {pkg.linkedRepo}
      </Link>
    );
  }
  return (
    <a
      href={pkg.repositoryUrl ?? `https://github.com/${pkg.linkedRepo}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate text-xs transition-colors hover:text-[color:var(--v4-acc)]"
      style={{ color: "var(--v4-ink-300)" }}
      title={pkg.linkedRepo}
    >
      {pkg.linkedRepo}
    </a>
  );
}

function Metric({
  current,
  delta,
  deltaPct,
  active = false,
}: {
  current: number;
  delta: number;
  deltaPct?: number | null;
  active?: boolean;
}) {
  const pct = Number(deltaPct) || 0;
  const deltaColor =
    delta > 0
      ? "var(--v4-sig-green)"
      : delta < 0
        ? "var(--v4-sig-red)"
        : "var(--v4-ink-300)";
  const pctColor =
    pct > 0
      ? "var(--v4-sig-green)"
      : pct < 0
        ? "var(--v4-sig-red)"
        : "var(--v4-ink-400)";
  return (
    <div className="text-right text-xs tabular-nums">
      {/* Total installs — primary, large, ink-100. NPM's whole point is
          "how many installs?" so this beats the delta in visual weight.
          Active window goes brighter (ink-000 + 600 weight). */}
      <div
        className="font-mono text-[13px]"
        style={{
          color: active ? "var(--v4-ink-000)" : "var(--v4-ink-100)",
          fontWeight: active ? 600 : 500,
        }}
      >
        {formatCompact(current)}
        <span
          className="ml-0.5 text-[10px]"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {" "}dl
        </span>
      </div>
      {/* Signed delta — secondary, color-coded green/red. */}
      <div
        className="mt-0.5 text-[11px] font-medium"
        style={{ color: deltaColor }}
      >
        {formatSignedCompact(delta)}
      </div>
      {/* Pct change — tertiary. */}
      {typeof deltaPct === "number" ? (
        <div
          className="mt-0.5 text-[10px] font-normal"
          style={{ color: pctColor }}
        >
          {formatDeltaPct(pct)}
        </div>
      ) : null}
    </div>
  );
}

function VersionPill({ pkg }: { pkg: NpmPackageRow }) {
  return (
    <span
      className="v2-mono inline-flex max-w-full items-center px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em]"
      style={{
        border: `1px solid ${NPM_RED}4D`,
        background: `${NPM_RED}0D`,
        color: NPM_RED,
        borderRadius: 2,
      }}
      title={pkg.publishedAt ?? undefined}
    >
      <span className="truncate">
        {pkg.latestVersion ? `v${pkg.latestVersion}` : "published"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cold-state fallback
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
          color: NPM_RED,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no repo-linked npm data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        Run <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:npm</code>{" "}
        to discover npm packages, keep only packages with GitHub repos attached,
        and populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/npm-packages.json</code>.
      </p>
    </section>
  );
}
