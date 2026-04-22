// /npm - top repo-linked npm packages by download movement.
//
// npm is its own terminal because it is registry adoption telemetry, not a
// news/social mention source. The scraper discovers package candidates,
// keeps only rows whose metadata links to GitHub, then ranks 24h/7d/30d.

import type { Metadata } from "next";
import Link from "next/link";
import {
  deltaForNpmWindow,
  deltaPctForNpmWindow,
  downloadsForNpmWindow,
  getNpmPackagesFile,
  getTopNpmPackages,
  npmCold,
  npmFetchedAt,
  type NpmPackageRow,
  type NpmWindow,
} from "@/lib/npm";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

const WINDOWS: NpmWindow[] = ["24h", "7d", "30d"];
const DEFAULT_WINDOW: NpmWindow = "24h";

// Dynamic because the active window comes from searchParams.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TrendingRepo - NPM Trending Packages",
  description:
    "Top npm package movement over 24h, 7d, and 30d windows, filtered to packages with GitHub repositories attached.",
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

export default async function NpmPage({ searchParams }: NpmPageProps) {
  const { range } = await searchParams;
  const activeWindow = parseWindow(range);
  const file = getNpmPackagesFile();
  const packages = getTopNpmPackages(activeWindow, 100);
  const top = packages[0];
  const cold = npmCold || packages.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              NPM / TOP PACKAGES
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// 24h / 7d / 30d repo-linked package movement"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            Top npm packages are discovered through npm registry search, then
            filtered to packages with a GitHub repository attached. The table
            ranks public download movement against the previous equivalent
            window; npm stats usually lag by 24-48 hours.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            <TabNav active={activeWindow} />

            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile
                label="LAST SCRAPE"
                value={formatRelative(npmFetchedAt)}
                hint={
                  npmFetchedAt
                    ? new Date(npmFetchedAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")
                    : undefined
                }
              />
              <StatTile
                label={`TOP ${activeWindow.toUpperCase()} MOVE`}
                value={top ? formatDeltaPct(deltaPctForNpmWindow(top, activeWindow)) : "0.0%"}
                hint={
                  top
                    ? `${top.name} - ${formatSignedCompact(deltaForNpmWindow(top, activeWindow))}`
                    : undefined
                }
              />
              <StatTile
                label="REPOS LINKED"
                value={file.counts.linkedRepos.toLocaleString()}
                hint={`${file.discovery.candidatesFound.toLocaleString()} search candidates`}
              />
              <StatTile
                label="DISCOVERY"
                value={file.discovery.queries.length.toLocaleString()}
                hint={`queries x ${file.discovery.searchSize} results`}
              />
            </section>

            <PackageFeed packages={packages} activeWindow={activeWindow} />
          </>
        )}
      </div>
    </main>
  );
}

function TabNav({ active }: { active: NpmWindow }) {
  return (
    <nav
      aria-label="npm time windows"
      className="mb-6 flex items-center gap-1 border-b border-border-primary overflow-x-auto scrollbar-hide"
    >
      {WINDOWS.map((window) => {
        const isActive = window === active;
        return (
          <Link
            key={window}
            href={`/npm?range=${window}`}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-3 min-h-[40px] text-xs uppercase tracking-wider whitespace-nowrap transition-colors ${
              isActive
                ? "text-text-primary border-b-2 border-accent-green"
                : "text-text-tertiary hover:text-text-secondary border-b-2 border-transparent"
            }`}
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
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_100px_100px_100px_110px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>PACKAGE</div>
        <div>REPO</div>
        <div className="text-right">24H MOVE</div>
        <div className="text-right">7D MOVE</div>
        <div className="text-right">30D MOVE</div>
        <div>VERSION</div>
      </div>
      <div className="grid md:hidden grid-cols-[32px_1fr_86px] gap-2 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>PACKAGE</div>
        <div className="text-right">{activeWindow.toUpperCase()} MOVE</div>
      </div>

      <ul>
        {packages.map((pkg, i) => (
          <li
            key={pkg.name}
            className="border-b border-border-primary/40 last:border-b-0"
          >
            <div className="hidden md:grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_100px_100px_100px_110px] gap-3 items-center px-3 py-2 min-h-[58px] hover:bg-bg-card-hover transition-colors">
              <Rank index={i} />
              <PackageIdentity pkg={pkg} />
              <RepoLink pkg={pkg} />
              <Metric
                current={pkg.downloads24h}
                delta={pkg.delta24h}
                deltaPct={pkg.deltaPct24h}
                active={activeWindow === "24h"}
              />
              <Metric
                current={pkg.downloads7d}
                delta={pkg.delta7d}
                deltaPct={pkg.deltaPct7d}
                active={activeWindow === "7d"}
              />
              <Metric
                current={pkg.downloads30d}
                delta={pkg.delta30d}
                deltaPct={pkg.deltaPct30d}
                active={activeWindow === "30d"}
              />
              <VersionPill pkg={pkg} />
            </div>

            <div className="grid md:hidden grid-cols-[32px_1fr_86px] gap-2 items-center px-3 py-2 min-h-[64px] hover:bg-bg-card-hover transition-colors">
              <Rank index={i} />
              <div className="min-w-0">
                <PackageIdentity pkg={pkg} />
                <div className="mt-1 flex items-center gap-2">
                  <VersionPill pkg={pkg} />
                </div>
              </div>
              <Metric
                current={downloadsForNpmWindow(pkg, activeWindow)}
                delta={deltaForNpmWindow(pkg, activeWindow)}
                deltaPct={deltaPctForNpmWindow(pkg, activeWindow)}
                active
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rank({ index }: { index: number }) {
  return (
    <div className="text-xs tabular-nums font-semibold text-accent-green">
      #{index + 1}
    </div>
  );
}

function PackageIdentity({ pkg }: { pkg: NpmPackageRow }) {
  return (
    <div className="min-w-0">
      <a
        href={pkg.npmUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-text-primary font-semibold hover:text-accent-green truncate block"
        title={pkg.name}
      >
        {pkg.name}
      </a>
      <div className="text-[11px] text-text-tertiary truncate">
        {pkg.description ?? "repo-linked npm package"}
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
        className="text-xs text-text-primary hover:text-accent-green truncate block"
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
      className="text-xs text-text-secondary hover:text-accent-green truncate block"
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
  return (
    <div
      className={`text-right text-xs tabular-nums ${
        active ? "text-text-primary font-semibold" : "text-text-secondary"
      }`}
    >
      <div
        className={
          delta > 0
            ? "text-accent-green"
            : delta < 0
              ? "text-accent-red"
              : undefined
        }
      >
        {formatSignedCompact(delta)}
      </div>
      <div className="mt-0.5 text-[10px] font-normal text-text-tertiary">
        {formatCompact(current)} dl
      </div>
      {typeof deltaPct === "number" ? (
        <div
          className={`mt-0.5 text-[10px] font-normal ${
            pct > 0
              ? "text-accent-green"
              : pct < 0
                ? "text-accent-red"
                : "text-text-tertiary"
          }`}
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
      className="inline-flex max-w-full items-center rounded-sm border border-accent-green/40 bg-accent-green/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent-green"
      title={pkg.publishedAt ?? undefined}
    >
      <span className="truncate">
        {pkg.latestVersion ? `v${pkg.latestVersion}` : "published"}
      </span>
    </span>
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
      <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
        {"// no repo-linked npm data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        Run <code className="text-text-primary">npm run scrape:npm</code> to
        discover npm packages, keep only packages with GitHub repos attached,
        and populate{" "}
        <code className="text-text-primary">data/npm-packages.json</code>.
      </p>
    </section>
  );
}
