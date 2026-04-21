// /npm - package download telemetry.
//
// This is its own terminal because npm is not editorial/news flow. It is
// registry adoption data: downloads, package metadata, and GitHub repo links.

import type { Metadata } from "next";
import Link from "next/link";
import {
  getNpmPackages,
  getNpmPackagesFile,
  npmCold,
  npmFetchedAt,
  type NpmPackageRow,
} from "@/lib/npm";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "TrendingRepo - NPM Packages",
  description:
    "npm package download velocity, registry metadata, and GitHub repo links for TrendingRepo package signals.",
};

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

function formatDeltaPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(Math.abs(n) >= 10 ? 0 : 1)}%`;
}

export default function NpmPage() {
  const file = getNpmPackagesFile();
  const packages = getNpmPackages();
  const published = packages.filter((pkg) => pkg.status === "ok");
  const missing = packages.filter((pkg) => pkg.status === "missing");
  const repoLinked = packages.filter((pkg) => pkg.linkedRepo);
  const top7d = published[0]?.downloads7d ?? 0;
  const cold = npmCold || packages.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              NPM / PACKAGES
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// package adoption telemetry, not news"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            Public npm download stats are scraped without auth and joined with
            registry metadata. Use this terminal for package velocity and
            repo-linked package badges; keep News Terminal for Reddit,
            HackerNews, ProductHunt, Bluesky, dev.to, and Lobsters.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
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
                label="PACKAGES"
                value={packages.length.toLocaleString()}
                hint={`${published.length} published / ${missing.length} cold`}
              />
              <StatTile
                label="REPOS LINKED"
                value={repoLinked.length.toLocaleString()}
                hint="registry repository -> GitHub"
              />
              <StatTile
                label="TOP 7D"
                value={formatCompact(top7d)}
                hint={file.lagHint}
              />
            </section>

            <PackageFeed packages={packages} />
          </>
        )}
      </div>
    </main>
  );
}

function PackageFeed({ packages }: { packages: NpmPackageRow[] }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1.35fr)_minmax(0,1fr)_110px_110px_86px_120px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>PACKAGE</div>
        <div>REPO</div>
        <div className="text-right">7D</div>
        <div className="text-right">30D</div>
        <div className="text-right">DELTA</div>
        <div>STATUS</div>
      </div>
      <div className="grid md:hidden grid-cols-[32px_1fr_86px] gap-2 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>PACKAGE</div>
        <div className="text-right">7D</div>
      </div>

      <ul>
        {packages.map((pkg, i) => (
          <li
            key={pkg.name}
            className="border-b border-border-primary/40 last:border-b-0"
          >
            <div className="hidden md:grid grid-cols-[40px_minmax(0,1.35fr)_minmax(0,1fr)_110px_110px_86px_120px] gap-3 items-center px-3 py-2 min-h-[58px] hover:bg-bg-card-hover transition-colors">
              <Rank index={i} status={pkg.status} />
              <PackageIdentity pkg={pkg} />
              <RepoLink pkg={pkg} />
              <Metric value={pkg.downloads7d} />
              <Metric value={pkg.downloads30d} muted />
              <Delta value={pkg.deltaPct7d} />
              <StatusPill pkg={pkg} />
            </div>

            <div className="grid md:hidden grid-cols-[32px_1fr_86px] gap-2 items-center px-3 py-2 min-h-[64px] hover:bg-bg-card-hover transition-colors">
              <Rank index={i} status={pkg.status} />
              <div className="min-w-0">
                <PackageIdentity pkg={pkg} />
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill pkg={pkg} />
                  <Delta value={pkg.deltaPct7d} />
                </div>
              </div>
              <Metric value={pkg.downloads7d} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rank({
  index,
  status,
}: {
  index: number;
  status: NpmPackageRow["status"];
}) {
  return (
    <div
      className={`text-xs tabular-nums font-semibold ${
        status === "ok" ? "text-accent-green" : "text-text-tertiary"
      }`}
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
        className="text-sm text-text-primary font-semibold hover:text-accent-green truncate block"
        title={pkg.name}
      >
        {pkg.name}
      </a>
      <div className="text-[11px] text-text-tertiary truncate">
        {pkg.description ?? pkg.error ?? "no registry metadata yet"}
      </div>
    </div>
  );
}

function RepoLink({ pkg }: { pkg: NpmPackageRow }) {
  if (!pkg.linkedRepo) {
    return <div className="text-[11px] text-text-tertiary">-</div>;
  }

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

function Metric({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <div
      className={`text-right text-xs tabular-nums ${
        muted ? "text-text-secondary" : "text-text-primary font-semibold"
      }`}
    >
      {formatCompact(value)}
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const up = value > 0;
  const flat = Math.abs(value) < 0.1;
  return (
    <div
      className={`text-right text-xs tabular-nums ${
        flat ? "text-text-tertiary" : up ? "text-accent-green" : "text-red-400"
      }`}
    >
      {formatDeltaPct(value)}
    </div>
  );
}

function StatusPill({ pkg }: { pkg: NpmPackageRow }) {
  const label =
    pkg.status === "ok"
      ? pkg.latestVersion
        ? `v${pkg.latestVersion}`
        : "published"
      : pkg.status === "missing"
        ? "not published"
        : "stats error";
  const cls =
    pkg.status === "ok"
      ? "border-accent-green/40 text-accent-green bg-accent-green/10"
      : pkg.status === "missing"
        ? "border-border-primary text-text-tertiary bg-bg-tertiary"
        : "border-red-500/40 text-red-300 bg-red-500/10";

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}
      title={pkg.error ?? undefined}
    >
      <span className="truncate">{label}</span>
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
        {"// no npm data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        Run <code className="text-text-primary">npm run scrape:npm</code> to
        populate <code className="text-text-primary">data/npm-packages.json</code>.
        No API key is required.
      </p>
    </section>
  );
}
