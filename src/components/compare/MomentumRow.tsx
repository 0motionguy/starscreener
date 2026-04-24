"use client";

// Momentum mini-module: overall score + 24h/7d star deltas. Used inside
// RepoProfileColumn. Deltas render with a subtle `text-up`/`text-down`
// tint when the parent grid flags this column as a diff outlier.

import { TrendingUp, TrendingDown } from "lucide-react";
import type { Repo } from "@/lib/types";
import type { RepoScore } from "@/lib/pipeline/types";
import type { DiffTone } from "./CompareProfileGrid";

interface MomentumRowProps {
  repo: Repo;
  score: RepoScore | null;
  delta24hTone: DiffTone;
  delta7dTone: DiffTone;
  momentumTone: DiffTone;
}

function formatDelta(n: number): string {
  if (n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  if (Math.abs(n) < 1000) return `${sign}${n}`;
  return `${sign}${(n / 1000).toFixed(1)}k`;
}

function toneClass(tone: DiffTone, value: number): string {
  // The diff system gates highlighting; otherwise we fall back to
  // directional colour for positive/negative deltas.
  if (tone === "up") return "text-accent-green";
  if (tone === "down") return "text-accent-red";
  if (value > 0) return "text-text-primary";
  if (value < 0) return "text-text-secondary";
  return "text-text-tertiary";
}

export function MomentumRow({
  repo,
  score,
  delta24hTone,
  delta7dTone,
  momentumTone,
}: MomentumRowProps) {
  const momentum = Math.round(repo.momentumScore ?? score?.overall ?? 0);
  const d24 = repo.starsDelta24h ?? 0;
  const d7 = repo.starsDelta7d ?? 0;

  const momentumClass =
    momentumTone === "up"
      ? "text-accent-green"
      : momentumTone === "down"
        ? "text-accent-red"
        : "text-text-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
          Momentum
        </span>
        <span
          className={`text-lg font-mono font-semibold tabular-nums ${momentumClass}`}
        >
          {momentum}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <DeltaCell
          label="24h"
          value={d24}
          className={toneClass(delta24hTone, d24)}
        />
        <DeltaCell
          label="7d"
          value={d7}
          className={toneClass(delta7dTone, d7)}
        />
      </div>
    </div>
  );
}

function DeltaCell({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  const Icon = value < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-text-tertiary font-mono uppercase">{label}</span>
      <Icon size={12} className={`shrink-0 ${className}`} aria-hidden="true" />
      <span className={`font-mono tabular-nums ${className}`}>
        {formatDelta(value)}
      </span>
    </div>
  );
}
