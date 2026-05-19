// NpmAcceleratingTable — terminal-table of npm packages with positive 7d
// momentum. Each row: name, scope, weekly downloads, 7d delta %, sparkline
// of daily downloads via the .spark <div data-points="..."> contract.

import Link from "next/link";

import { getDailyDownloadsForPackage } from "@/lib/npm-daily";
import type { NpmPackageRow } from "@/lib/npm";

interface NpmAcceleratingTableProps {
  packages: NpmPackageRow[];
  limit?: number;
}

function scopeOf(name: string): { scope: string; bare: string } {
  if (name.startsWith("@")) {
    const idx = name.indexOf("/");
    if (idx > 0) return { scope: name.slice(0, idx), bare: name.slice(idx + 1) };
  }
  return { scope: "—", bare: name };
}

export function NpmAcceleratingTable({ packages, limit = 7 }: NpmAcceleratingTableProps) {
  const rows = packages
    .filter((p) => (p.deltaPct7d ?? 0) > 0 && (p.downloads7d ?? 0) > 0)
    .sort((a, b) => (b.deltaPct7d ?? 0) - (a.deltaPct7d ?? 0))
    .slice(0, limit);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            // 04 · npm · accelerating 7d
          </span>
          <h2
            style={{
              fontSize: 15,
              color: "var(--fg-bright)",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            Top npm momentum
          </h2>
        </div>
        <Link
          href="/?cat=repos&topic=npm"
          prefetch={false}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--accent)",
            textDecoration: "none",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          View all →
        </Link>
      </div>

      <div role="table" style={{ width: "100%" }}>
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.6fr) 90px 100px 80px minmax(0, 1.2fr)",
            gap: 10,
            padding: "6px 8px",
            borderBottom: "1px solid var(--border-subtle)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--fg-faint)",
          }}
        >
          <span>Package</span>
          <span>Scope</span>
          <span style={{ textAlign: "right" }}>Weekly DL</span>
          <span style={{ textAlign: "right" }}>Δ 7d</span>
          <span>Trajectory</span>
        </div>
        {rows.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--fg-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            No npm packages accelerating right now.
          </div>
        ) : (
          rows.map((pkg) => {
            const { scope, bare } = scopeOf(pkg.name);
            const daily = getDailyDownloadsForPackage(pkg.name);
            const sparkPoints =
              daily.length > 1
                ? daily.map((d) => d.downloads).join(",")
                : (pkg.downloads ?? []).map((d) => d.downloads).join(",");
            return (
              <div
                key={pkg.name}
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.6fr) 90px 100px 80px minmax(0, 1.2fr)",
                  gap: 10,
                  padding: "8px 8px",
                  borderBottom: "1px solid var(--border-subtle)",
                  alignItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                <Link
                  href={pkg.npmUrl}
                  prefetch={false}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--fg-bright)",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {bare}
                </Link>
                <span style={{ color: "var(--fg-muted)" }}>{scope}</span>
                <span
                  style={{
                    textAlign: "right",
                    color: "var(--fg-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pkg.downloads7d.toLocaleString()}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color: "var(--up)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  +{(pkg.deltaPct7d ?? 0).toFixed(1)}%
                </span>
                <div className="spark up" data-points={sparkPoints} aria-hidden="true" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
