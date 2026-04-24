"use client";

/**
 * SidebarFilters — languages / stars range / min momentum / toggles.
 *
 * All state lives in `useFilterStore`. Changing any control mutates the
 * store directly; downstream terminal views re-filter via `useFilteredRepos`.
 */
import { Check } from "lucide-react";
import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STARS_PRESETS: Array<{
  label: string;
  value: [number, number] | null;
}> = [
  { label: "Any", value: null },
  { label: "<1k", value: [0, 999] },
  { label: "1-10k", value: [1_000, 10_000] },
  { label: "10-50k", value: [10_000, 50_000] },
  { label: ">50k", value: [50_000, Number.MAX_SAFE_INTEGER] },
];

function rangesEqual(
  a: [number, number] | null,
  b: [number, number] | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a[0] === b[0] && a[1] === b[1];
}

export interface SidebarFiltersProps {
  languages: string[];
}

export function SidebarFilters({ languages }: SidebarFiltersProps) {
  const selectedLanguages = useFilterStore((s) => s.languages);
  const toggleLanguage = useFilterStore((s) => s.toggleLanguage);
  const starsRange = useFilterStore((s) => s.starsRange);
  const setStarsRange = useFilterStore((s) => s.setStarsRange);
  const minMomentum = useFilterStore((s) => s.minMomentum);
  const setMinMomentum = useFilterStore((s) => s.setMinMomentum);
  const onlyWatched = useFilterStore((s) => s.onlyWatched);
  const toggleOnlyWatched = useFilterStore((s) => s.toggleOnlyWatched);
  const excludeArchived = useFilterStore((s) => s.excludeArchived);
  const toggleExcludeArchived = useFilterStore((s) => s.toggleExcludeArchived);

  return (
    <div className="flex flex-col gap-4 px-3 pt-1">
      {/* Languages ------------------------------------------------------- */}
      {languages.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="label-micro text-text-muted">Language</span>
          <div className="flex flex-wrap gap-1">
            {languages.map((lang) => {
              const selected = selectedLanguages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  aria-pressed={selected}
                  className={cn(
                    "px-2 h-6 rounded-full border text-[11px] font-medium",
                    "transition-colors duration-150",
                    selected
                      ? "bg-functional-glow text-functional border-functional/40"
                      : "bg-bg-tertiary text-text-tertiary border-border-secondary hover:text-text-secondary hover:border-border-strong",
                  )}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stars range ----------------------------------------------------- */}
      <div className="flex flex-col gap-1.5">
        <span className="label-micro text-text-muted">Stars</span>
        <div className="grid grid-cols-5 gap-1">
          {STARS_PRESETS.map((preset) => {
            const active = rangesEqual(starsRange, preset.value);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setStarsRange(preset.value)}
                aria-pressed={active}
                className={cn(
                  "h-7 text-[10px] font-mono tabular-nums rounded-sm border",
                  "transition-colors duration-150",
                  active
                    ? "bg-functional-glow text-functional border-functional/40"
                    : "bg-bg-tertiary text-text-tertiary border-border-secondary hover:text-text-secondary hover:border-border-strong",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Min momentum ---------------------------------------------------- */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="label-micro text-text-muted">Min Momentum</span>
          <span className="font-mono text-[10px] tabular-nums text-functional">
            {minMomentum}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={minMomentum}
          onChange={(e) => setMinMomentum(Number(e.target.value))}
          aria-label="Minimum momentum"
          aria-valuenow={minMomentum}
          className="w-full h-1 cursor-pointer"
          style={{ accentColor: "var(--color-functional)" }}
        />
      </div>

      {/* Toggles --------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <ToggleRow
          label="Only Watched"
          checked={onlyWatched}
          onChange={toggleOnlyWatched}
        />
        <ToggleRow
          label="Exclude Archived"
          checked={excludeArchived}
          onChange={toggleExcludeArchived}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable toggle row — square 14px checkbox with Check icon when on.
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className="w-full flex items-center gap-2.5 py-1 text-[12px] text-text-secondary hover:text-text-primary"
    >
      <span
        className={cn(
          "w-[14px] h-[14px] rounded-sm border flex items-center justify-center shrink-0",
          "transition-colors duration-150",
          checked
            ? "bg-functional border-functional"
            : "bg-bg-tertiary border-border-strong",
        )}
      >
        {checked && (
          <Check className="w-3 h-3 text-bg-primary" strokeWidth={3} />
        )}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Header slot — filter count + clear button (exported for Sidebar header use)
// ---------------------------------------------------------------------------

export function SidebarFiltersHeader() {
  const languages = useFilterStore((s) => s.languages);
  const starsRange = useFilterStore((s) => s.starsRange);
  const minMomentum = useFilterStore((s) => s.minMomentum);
  const onlyWatched = useFilterStore((s) => s.onlyWatched);
  const excludeArchived = useFilterStore((s) => s.excludeArchived);
  const setLanguages = useFilterStore((s) => s.setLanguages);
  const setStarsRange = useFilterStore((s) => s.setStarsRange);
  const setMinMomentum = useFilterStore((s) => s.setMinMomentum);
  const toggleOnlyWatched = useFilterStore((s) => s.toggleOnlyWatched);
  const toggleExcludeArchived = useFilterStore((s) => s.toggleExcludeArchived);

  const activeCount =
    (languages.length > 0 ? 1 : 0) +
    (starsRange !== null ? 1 : 0) +
    (minMomentum > 0 ? 1 : 0) +
    (onlyWatched ? 1 : 0) +
    // Exclude-archived defaults ON — turning it OFF counts as an active filter.
    (excludeArchived === false ? 1 : 0);

  if (activeCount === 0) return null;

  const clearAll = () => {
    setLanguages([]);
    setStarsRange(null);
    setMinMomentum(0);
    if (onlyWatched) toggleOnlyWatched();
    if (!excludeArchived) toggleExcludeArchived();
  };

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-functional-glow text-functional tabular-nums">
        {activeCount}
      </span>
      <button
        type="button"
        onClick={clearAll}
        className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary hover:text-functional transition-colors"
      >
        Clear
      </button>
    </span>
  );
}
