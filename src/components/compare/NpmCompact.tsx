"use client";

// npm mini-module. Picks the first package from the canonical profile's
// npm list (already ordered by the loader) and renders package name + 7d
// downloads. Diff-highlighted when the column is a download outlier.

import { Package } from "lucide-react";
import type { NpmPackageRow } from "@/lib/npm";
import type { DiffTone } from "./CompareProfileGrid";

interface NpmCompactProps {
  packages: NpmPackageRow[];
  downloadsTone: DiffTone;
}

function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function NpmCompact({ packages, downloadsTone }: NpmCompactProps) {
  const top = packages[0] ?? null;

  const toneClass =
    downloadsTone === "up"
      ? "text-accent-green"
      : downloadsTone === "down"
        ? "text-accent-red"
        : "text-text-primary";

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Package size={12} className="text-text-tertiary shrink-0" />
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          npm · 7d
        </span>
      </div>
      {top ? (
        <div className="flex items-center justify-between gap-2 min-w-0">
          <a
            href={top.npmUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs font-mono text-text-secondary truncate hover:text-text-primary hover:underline min-w-0"
          >
            {top.name}
          </a>
          <span
            className={`text-xs font-mono tabular-nums shrink-0 ${toneClass}`}
          >
            {formatCompact(top.downloads7d ?? 0)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">—</p>
      )}
    </div>
  );
}
