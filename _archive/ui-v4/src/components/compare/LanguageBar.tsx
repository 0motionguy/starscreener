import type { JSX } from "react";
import type { CompareRepoBundle } from "@/lib/github-compare";

interface LanguageBarProps {
  bundle: CompareRepoBundle;
}

/** Deterministic language -> hex color map (GitHub-linguist inspired). */
const LANGUAGE_COLOR: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#facc15",
  Rust: "#dea584",
  Go: "#00add8",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Ruby: "#701516",
  Shell: "#89e051",
  Bash: "#89e051",
  Java: "#b07219",
  Kotlin: "#a97bff",
  Swift: "#f05138",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  PHP: "#4f5d95",
  Dart: "#00b4ab",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Solidity: "#aa6746",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Lua: "#000080",
  "Objective-C": "#438eff",
  R: "#198ce7",
  Scala: "#c22d40",
  Zig: "#ec915c",
};

const FALLBACK = "#5a5a5c";
const MIN_LEGEND_PERCENT = 5;

function colorFor(name: string): string {
  return LANGUAGE_COLOR[name] ?? FALLBACK;
}

/**
 * Horizontal stacked bar + legend visualising the language breakdown of a repo.
 */
export function LanguageBar({ bundle }: LanguageBarProps): JSX.Element {
  const languages = bundle.languages ?? [];

  if (languages.length === 0) {
    return <span className="text-xs text-text-tertiary font-mono">—</span>;
  }

  const sorted = [...languages].sort((a, b) => b.percent - a.percent);
  const legend: Array<{ name: string; percent: number; color: string }> = [];
  let otherPct = 0;
  for (const lang of sorted) {
    if (lang.percent >= MIN_LEGEND_PERCENT) {
      legend.push({
        name: lang.name,
        percent: lang.percent,
        color: colorFor(lang.name),
      });
    } else {
      otherPct += lang.percent;
    }
  }
  if (otherPct > 0) {
    legend.push({ name: "Other", percent: otherPct, color: FALLBACK });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-bg-secondary">
        {sorted.map((lang) => (
          <div
            key={lang.name}
            className="h-full"
            style={{
              width: `${lang.percent}%`,
              backgroundColor: colorFor(lang.name),
            }}
            title={`${lang.name} · ${lang.percent.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {legend.map((item) => (
          <div
            key={item.name}
            className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary"
          >
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="truncate">{item.name}</span>
            <span className="tabular-nums text-text-tertiary">
              {item.percent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
