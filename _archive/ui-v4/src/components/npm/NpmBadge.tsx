"use client";

import { Chip } from "@/components/ui/Badge";

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
  return `${pkg.name}: ${pkg.downloads7d.toLocaleString("en-US")} npm downloads / 7d${suffix}`;
}

export function NpmBadge({ packages, size = "sm" }: NpmBadgeProps) {
  const published = packages
    .filter((pkg) => pkg.status === "ok" && pkg.downloads7d > 0)
    .sort((a, b) => b.downloads7d - a.downloads7d);
  const top = published[0];
  if (!top) return null;

  const sizeClasses =
    size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[10px]";
  return (
    <Chip
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(top.npmUrl, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(top, published.length)}
      aria-label={`${top.name} has ${top.downloads7d} npm downloads in the last 7 days`}
      className={sizeClasses}
      style={{
        color: "var(--red)",
        borderColor: "rgba(255, 77, 77, 0.4)",
        background:
          top.downloads7d >= 1_000_000
            ? "rgba(255, 77, 77, 0.12)"
            : "var(--bg-050)",
      }}
    >
      <span
        className="flex size-3 items-center justify-center bg-[var(--red)] text-[8px] font-bold leading-none text-[#0a0a0a]"
        aria-hidden
      >
        N
      </span>
      {formatCompact(top.downloads7d)}
    </Chip>
  );
}

export default NpmBadge;
