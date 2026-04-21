"use client";

// Small inline npm badge for repo rows. Shows only when npm registry metadata
// links a package back to the repo. This is adoption/download velocity, not a
// social mention count, so the chip displays 7d downloads.

type NpmPackageForBadge = {
  name: string;
  status: "ok" | "missing" | "error";
  npmUrl: string;
  downloads7d: number;
};

interface NpmBadgeProps {
  packages: NpmPackageForBadge[];
  size?: "sm" | "md";
}

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}

function buildTooltip(pkg: NpmPackageForBadge, count: number): string {
  const suffix = count > 1 ? ` (${count} linked packages)` : "";
  return `${pkg.name}: ${pkg.downloads7d.toLocaleString()} npm downloads / 7d${suffix}`;
}

export function NpmBadge({ packages, size = "sm" }: NpmBadgeProps) {
  const published = packages
    .filter((pkg) => pkg.status === "ok" && pkg.downloads7d > 0)
    .sort((a, b) => b.downloads7d - a.downloads7d);
  const top = published[0];
  if (!top) return null;

  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(top.npmUrl, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(top, published.length)}
      aria-label={`${top.name} has ${top.downloads7d} npm downloads in the last 7 days`}
      className={`inline-flex items-center gap-1 rounded-md text-[10px] font-mono border transition-colors cursor-pointer ${sizeClasses}`}
      style={{
        color: "#cb3837",
        borderColor: "#cb38374D",
        backgroundColor: top.downloads7d >= 1_000_000 ? "#cb38371A" : "transparent",
      }}
    >
      <span
        className="text-white text-[8px] font-bold w-3 h-3 leading-none rounded-sm flex items-center justify-center"
        style={{ backgroundColor: "#cb3837" }}
        aria-hidden
      >
        N
      </span>
      {formatCompact(top.downloads7d)}
    </button>
  );
}

export default NpmBadge;
