import type { JSX } from "react";
import {
  Trophy,
  Flame,
  TrendingUp,
  Users,
  GitMerge,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CompareRepoBundle } from "@/lib/github-compare";

interface WinnerChipsProps {
  bundles: CompareRepoBundle[];
}

interface Category {
  icon: LucideIcon;
  label: string;
  score: (b: CompareRepoBundle) => number;
}

/** Sum commits over the last N weeks of the commitActivity series. */
function commitsLastWeeks(bundle: CompareRepoBundle, weeks: number): number {
  const series = bundle.commitActivity ?? [];
  if (series.length === 0) return 0;
  const slice = series.slice(-weeks);
  let total = 0;
  for (const w of slice) {
    for (const d of w.days) total += d;
  }
  return total;
}

const CATEGORIES: Category[] = [
  { icon: Trophy, label: "Most Stars", score: (b) => b.stars },
  { icon: Flame, label: "Most Active", score: (b) => commitsLastWeeks(b, 4) },
  {
    icon: TrendingUp,
    label: "Growing Fastest",
    // Proxy: commits-30d (see spec). Refine when stars-history is on bundle.
    score: (b) => commitsLastWeeks(b, 4),
  },
  {
    icon: Users,
    label: "Most Contributors",
    score: (b) => b.contributors?.length ?? 0,
  },
  {
    icon: GitMerge,
    label: "Fastest PR Throughput",
    score: (b) => b.pullsMergedRecently,
  },
  {
    icon: Zap,
    label: "Most Issues Resolved",
    score: (b) => b.issuesClosedRecently,
  },
];

function pickWinner(
  bundles: CompareRepoBundle[],
  score: (b: CompareRepoBundle) => number,
): CompareRepoBundle | null {
  let best: CompareRepoBundle | null = null;
  let bestScore = -Infinity;
  for (const b of bundles) {
    if (!b.ok) continue;
    const s = score(b);
    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  }
  if (!best || bestScore <= 0) return null;
  return best;
}

/**
 * Row of pill chips declaring per-category winners across the compared repos.
 */
export function WinnerChips({ bundles }: WinnerChipsProps): JSX.Element | null {
  if (bundles.length < 2) return null;

  const chips = CATEGORIES.map((cat) => {
    const winner = pickWinner(bundles, cat.score);
    return winner ? { cat, winner } : null;
  }).filter((x): x is { cat: Category; winner: CompareRepoBundle } => x !== null);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ cat, winner }) => {
        const Icon = cat.icon;
        return (
          <div
            key={cat.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-primary bg-bg-card px-2.5 py-1 font-mono text-[11px] text-text-secondary"
            title={`${cat.label}: ${winner.fullName}`}
          >
            <Icon className="size-3 text-brand shrink-0" aria-hidden="true" />
            <span className="text-text-tertiary uppercase tracking-wider text-[10px]">
              {cat.label}
            </span>
            <span className="text-text-primary font-semibold truncate max-w-[160px]">
              {winner.fullName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
