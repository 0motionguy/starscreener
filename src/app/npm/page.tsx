// /npm — V2 top repo-linked npm packages.
//
// npm is its own terminal because it is registry adoption telemetry,
// not a news/social mention source. The scraper discovers package
// candidates, keeps only rows whose metadata links to GitHub, then
// ranks 24h/7d/30d. V2 design: TerminalBar header, V2 tab nav, V2
// stat tiles, V2 table with v2-row hover state.

import type { Metadata } from "next";
import Link from "next/link";
import {
  deltaForNpmWindow,
  deltaPctForNpmWindow,
  downloadsForNpmWindow,
  getNpmCold,
  getNpmFetchedAt,
  getNpmPackagesFile,
  getTopNpmPackages,
  refreshNpmFromStore,
  type NpmPackageRow,
  type NpmWindow,
} from "@/lib/npm";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

const WINDOWS: NpmWindow[] = ["24h", "7d", "30d"];
const DEFAULT_WINDOW: NpmWindow = "24h";

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
  await refreshNpmFromStore();
  const activeWindow = parseWindow(range);
  const file = getNpmPackagesFile();
  const packages = getTopNpmPackages(activeWindow, 100);
  const npmFetchedAt = getNpmFetchedAt();
  const top = packages[0];
  const cold = getNpmCold() || packages.length === 0;

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>NPM · TOP · REPO-LINKED
              </>
            }
            status={cold ? "COLD" : `${packages.length} PKGS`}
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            NPM · TOP PACKAGES
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Top npm packages discovered through registry search, then filtered
            to packages with a GitHub repository attached. The table ranks
            public download movement against the previous equivalent window;
            npm stats usually lag by 24-48 hours.
          </p>
        </div>
      </section>

      {cold ? (
        <ColdStateV2 />
      ) : (
        <>
          <section className="border-b border-[color:var(--v2-line-100)]">
            <div className="v2-frame py-4">
              <TabNavV2 active={activeWindow} />
            </div>
          </section>

          <section className="border-b border-[color:var(--v2-line-100)]">
            <div className="v2-frame py-6">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                METRICS · {activeWindow.toUpperCase()}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTileV2
                  label="LAST · SCRAPE"
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
                <StatTileV2
                  label={`TOP · ${activeWindow.toUpperCase()} · MOVE`}
                  value={
                    top
                      ? formatDeltaPct(deltaPctForNpmWindow(top, activeWindow))
                      : "0.0%"
                  }
                  hint={
                    top
                      ? `${top.name} - ${formatSignedCompact(deltaForNpmWindow(top, activeWindow))}`
                      : undefined
                  }
                />
                <StatTileV2
                  label="REPOS · LINKED"
                  value={file.counts.linkedRepos.toLocaleString("en-US")}
                  hint={`${file.discovery.candidatesFound.toLocaleString("en-US")} search candidates`}
                />
                <StatTileV2
                  label="DISCOVERY · QUERIES"
                  value={file.discovery.queries.length.toLocaleString("en-US")}
                  hint={`queries x ${file.discovery.searchSize} results`}
                />
              </div>
            </div>
          </section>

          <section>
            <div className="v2-frame py-6">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                FEED · {activeWindow.toUpperCase()} · TOP{" "}
                <span style={{ color: "var(--v2-ink-100)" }}>
                  {packages.length}
                </span>
              </p>
              <PackageFeedV2
                packages={packages}
                activeWindow={activeWindow}
              />
            </div>
          </section>
        </>
      )}
    </>
  );
}

function TabNavV2({ active }: { active: NpmWindow }) {
  return (
    <nav
      aria-label="npm time windows"
      className="flex items-center gap-2 flex-wrap"
    >
      {WINDOWS.map((window) => {
        const isActive = window === active;
        return (
          <Link
            key={window}
            href={`/npm?range=${window}`}
            aria-current={isActive ? "page" : undefined}
            className="v2-mono px-3 py-1.5 inline-block transition"
            style={{
              fontSize: 11,
              letterSpacing: "0.20em",
              color: isActive ? "var(--v2-bg-000)" : "var(--v2-ink-300)",
              background: isActive ? "var(--v2-acc)" : "transparent",
              border: `1px solid ${
                isActive ? "var(--v2-acc)" : "var(--v2-line-200)"
              }`,
            }}
          >
            TOP {window.toUpperCase()}
          </Link>
        );
      })}
    </nav>
  );
}

function PackageFeedV2({
  packages,
  activeWindow,
}: {
  packages: NpmPackageRow[];
  activeWindow: NpmWindow;
}) {
  return (
    <div className="v2-card overflow-hidden">
      <div
        className="hidden md:grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_100px_100px_100px_110px] gap-3 items-center px-3 h-9 v2-mono"
        style={{
          borderBottom: "1px solid var(--v2-line-100)",
          color: "var(--v2-ink-400)",
          fontSize: 10,
          letterSpacing: "0.20em",
        }}
      >
        <div>#</div>
        <div>PACKAGE</div>
        <div>REPO</div>
        <div className="text-right">24H · MOVE</div>
        <div className="text-right">7D · MOVE</div>
        <div className="text-right">30D · MOVE</div>
        <div>VERSION</div>
      </div>
      <div
        className="grid md:hidden grid-cols-[32px_1fr_86px] gap-2 items-center px-3 h-9 v2-mono"
        style={{
          borderBottom: "1px solid var(--v2-line-100)",
          color: "var(--v2-ink-400)",
          fontSize: 10,
          letterSpacing: "0.20em",
        }}
      >
        <div>#</div>
        <div>PACKAGE</div>
        <div className="text-right">{activeWindow.toUpperCase()} · MOVE</div>
      </div>

      <ul>
        {packages.map((pkg, i) => (
          <li
            key={pkg.name}
            style={{
              borderTop: i === 0 ? "none" : "1px dashed var(--v2-line-soft)",
            }}
          >
            <div className="hidden md:grid grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_100px_100px_100px_110px] gap-3 items-center px-3 py-2 min-h-[58px] transition-colors hover:bg-[color:var(--v2-bg-100)]">
              <Rank index={i} />
              <PackageIdentity pkg={pkg} />
              <RepoLink pkg={pkg} />
              <Metric
                delta={pkg.delta24h}
                deltaPct={pkg.deltaPct24h}
                current={pkg.downloads24h}
                active={activeWindow === "24h"}
              />
              <Metric
                delta={pkg.delta7d}
                deltaPct={pkg.deltaPct7d}
                current={pkg.downloads7d}
                active={activeWindow === "7d"}
              />
              <Metric
                delta={pkg.delta30d}
                deltaPct={pkg.deltaPct30d}
                current={pkg.downloads30d}
                active={activeWindow === "30d"}
              />
              <VersionPill pkg={pkg} />
            </div>

            <div className="grid md:hidden grid-cols-[32px_1fr_86px] gap-2 items-center px-3 py-2 min-h-[64px] transition-colors hover:bg-[color:var(--v2-bg-100)]">
              <Rank index={i} />
              <div className="min-w-0">
                <PackageIdentity pkg={pkg} />
                <div className="mt-1 flex items-center gap-2">
                  <VersionPill pkg={pkg} />
                </div>
              </div>
              <Metric
                delta={deltaForNpmWindow(pkg, activeWindow)}
                deltaPct={deltaPctForNpmWindow(pkg, activeWindow)}
                current={downloadsForNpmWindow(pkg, activeWindow)}
                active
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Rank({ index }: { index: number }) {
  return (
    <div
      className="v2-mono-tight tabular-nums"
      style={{ color: "var(--v2-acc)", fontSize: 12, fontWeight: 510 }}
    >
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
        className="text-[14px] truncate block transition-colors"
        style={{ color: "var(--v2-ink-100)", fontWeight: 510 }}
        title={pkg.name}
      >
        {pkg.name}
      </a>
      <div
        className="v2-mono-tight truncate"
        style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
      >
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
        className="v2-mono-tight truncate block transition-colors"
        style={{ color: "var(--v2-ink-200)", fontSize: 12 }}
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
      className="v2-mono-tight truncate block"
      style={{ color: "var(--v2-ink-300)", fontSize: 12 }}
      title={pkg.linkedRepo}
    >
      {pkg.linkedRepo}
    </a>
  );
}

function Metric({
  delta,
  deltaPct,
  current,
  active = false,
}: {
  delta: number;
  deltaPct?: number | null;
  current: number;
  active?: boolean;
}) {
  const pct = Number(deltaPct) || 0;
  const deltaColor =
    delta > 0
      ? "var(--v2-sig-green)"
      : delta < 0
        ? "var(--v2-sig-red)"
        : "var(--v2-ink-300)";
  return (
    <div
      className="text-right tabular-nums"
      style={{
        color: active ? "var(--v2-ink-100)" : "var(--v2-ink-300)",
        fontWeight: active ? 510 : 400,
      }}
    >
      <div style={{ color: deltaColor, fontSize: 13 }}>
        {formatSignedCompact(delta)}
      </div>
      <div
        className="v2-mono-tight"
        style={{ color: "var(--v2-ink-400)", fontSize: 10 }}
      >
        {formatCompact(current)} DL
      </div>
      {typeof deltaPct === "number" ? (
        <div
          className="v2-mono-tight"
          style={{
            color:
              pct > 0
                ? "var(--v2-sig-green)"
                : pct < 0
                  ? "var(--v2-sig-red)"
                  : "var(--v2-ink-400)",
            fontSize: 10,
          }}
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
      className="v2-tag v2-tag-acc inline-flex max-w-full items-center"
      title={pkg.publishedAt ?? undefined}
    >
      <span className="truncate">
        {pkg.latestVersion ? `v${pkg.latestVersion}` : "PUBLISHED"}
      </span>
    </span>
  );
}

function StatTileV2({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="v2-stat">
      <div className="v truncate" title={value}>
        {value}
      </div>
      <div className="k">
        <span aria-hidden>{"// "}</span>
        {label}
      </div>
      {hint ? (
        <div
          className="mt-1 v2-mono-tight truncate"
          style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
          title={hint}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ColdStateV2() {
  return (
    <section>
      <div className="v2-frame py-12">
        <div className="v2-card p-8">
          <p
            className="v2-mono mb-3"
            style={{ color: "var(--v2-acc)" }}
          >
            <span aria-hidden>{"// "}</span>
            NO REPO-LINKED NPM DATA
          </p>
          <p
            className="text-[14px] leading-relaxed max-w-[60ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Run{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
            >
              npm run scrape:npm
            </code>{" "}
            to discover npm packages, keep only packages with GitHub repos
            attached, and populate{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
            >
              data/npm-packages.json
            </code>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
