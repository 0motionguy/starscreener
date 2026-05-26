// NpmAcceleratingTable — packages with positive weekly download velocity.
// Real data only. No SEED_ROWS, no synthesizeSpark() — if the registry feed
// is sparse, the table renders shorter (or empty) rather than inventing
// rows or sparklines.

import Link from "next/link";

import { RepoSparkline } from "@/components/trending/RepoSparkline";
import { getDailyDownloadsForPackage } from "@/lib/npm-daily";
import type { NpmPackageRow } from "@/lib/npm";

interface NpmAcceleratingTableProps {
  packages: NpmPackageRow[];
  limit?: number;
}

interface NpmDisplayRow {
  name: string;
  scope: string;
  bare: string;
  version: string;
  linkedRepo: string;
  weeklyDownloads: number;
  deltaPct: number;
  href: string;
  points: number[];
}

function splitPackageName(name: string): { scope: string; bare: string } {
  if (name.startsWith("@")) {
    const idx = name.indexOf("/");
    if (idx > 0) return { scope: name.slice(0, idx + 1), bare: name.slice(idx + 1) };
  }
  return { scope: "", bare: name };
}

function versionLabel(pkg: NpmPackageRow): string {
  const version = pkg.latestVersion
    ? pkg.latestVersion.startsWith("v")
      ? pkg.latestVersion
      : `v${pkg.latestVersion}`
    : "registry";
  return pkg.linkedRepo ? `${version} - ${pkg.linkedRepo}` : version;
}

function rowFromPackage(pkg: NpmPackageRow): NpmDisplayRow {
  const { scope, bare } = splitPackageName(pkg.name);
  const daily = getDailyDownloadsForPackage(pkg.name);
  // Real series only — daily timeseries if present, otherwise the embedded
  // weekly buckets. No synthesizeSpark() fabrication when both are empty.
  const points =
    daily.length > 1
      ? daily.map((day) => day.downloads)
      : pkg.downloads?.length > 1
        ? pkg.downloads.map((day) => day.downloads)
        : [];
  return {
    name: pkg.name,
    scope,
    bare,
    version: versionLabel(pkg),
    linkedRepo: pkg.linkedRepo,
    weeklyDownloads: pkg.downloads7d,
    deltaPct: pkg.deltaPct7d ?? 0,
    href: pkg.npmUrl,
    points,
  };
}

function buildRows(packages: NpmPackageRow[], limit: number): NpmDisplayRow[] {
  const derived = packages
    .filter((pkg) => (pkg.deltaPct7d ?? 0) > 0 && (pkg.downloads7d ?? 0) > 0)
    .sort((a, b) => {
      if ((b.deltaPct7d ?? 0) !== (a.deltaPct7d ?? 0)) {
        return (b.deltaPct7d ?? 0) - (a.deltaPct7d ?? 0);
      }
      return (b.downloads7d ?? 0) - (a.downloads7d ?? 0);
    })
    .map(rowFromPackage);

  const rows: NpmDisplayRow[] = [];
  const seen = new Set<string>();
  for (const row of derived) {
    if (seen.has(row.name.toLowerCase())) continue;
    rows.push(row);
    seen.add(row.name.toLowerCase());
    if (rows.length >= limit) return rows;
  }
  return rows;
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toLocaleString();
}

export function NpmAcceleratingTable({ packages, limit = 7 }: NpmAcceleratingTableProps) {
  const rows = buildRows(packages, limit);
  // Honest count: real accelerating packages, no synthetic floor.
  const acceleratingCount = packages.filter(
    (pkg) => (pkg.deltaPct7d ?? 0) > 0 && (pkg.downloads7d ?? 0) > 0,
  ).length;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>NPM accelerating</b> - weekly downloads - top {limit}
        </h2>
        <span className="grow" />
        <span className="chip up">+30%+ wkly</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-faint)" }}>
          No npm packages accelerating right now — registry feed is quiet.
        </div>
      ) : (
      <div>
        {rows.map((row) => (
          <div key={row.name} className="npm-row">
            <div style={{ minWidth: 0 }}>
              <a href={row.href} target="_blank" rel="noopener noreferrer" className="npm-name" style={{ textDecoration: "none", display: "block" }}>
                {row.scope && <span className="scope">{row.scope}</span>}
                {row.bare}
              </a>
              <span className="muted" style={{ fontSize: 10.5 }}>
                {row.version}
              </span>
            </div>
            <div className="npm-dl">
              {formatDownloads(row.weeklyDownloads)}{" "}
              <span className="muted" style={{ fontSize: 10, fontWeight: 400 }}>
                /wk
              </span>
            </div>
            {row.points.length > 1 ? (
              <RepoSparkline data={row.points} variant="up" className="npm-spark" />
            ) : (
              <div className="npm-spark" aria-hidden="true" style={{ color: "var(--fg-faint)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center" }}>·</div>
            )}
          </div>
        ))}
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11 }}>
            Showing {rows.length} of {acceleratingCount} accelerating packages
          </span>
          <Link className="btn ghost sm" href="/?cat=repos&topic=npm" prefetch={false} style={{ textDecoration: "none" }}>
            All packages
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}
