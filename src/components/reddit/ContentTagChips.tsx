"use client";

// Filter chips above the Reddit post feeds. Multi-select (OR semantics) on
// content_tags, plus a "show all" toggle that flips off the default
// value_score >= 1 filter.
//
// Shared by /reddit (repo-linked feed) and /reddit/trending (firehose) —
// both pages read the same RedditPost shape with content_tags + value_score.
//
// URL state:
//   ?tags=repos,skills,mcp   — active chips
//   ?showAll=1               — bypass default value_score filter
//
// Visual spec: ULTRA-premium pill (Linear/Vercel/Bloomberg quality).
//   - 32px tall, gradient background, brand-colored icon at 16px
//   - Active: brand-tinted gradient + brand border + outer glow + monochrome icon
//   - Counts render as inset data-badges, not dangling numerals

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bot, Code, Terminal } from "lucide-react";
import type { ComponentType, CSSProperties, SVGProps } from "react";
import {
  AnnouncementIcon,
  GithubIcon,
  McpIcon,
  NewsIcon,
  PromptIcon,
  SkillIcon,
  TutorialIcon,
} from "@/components/brand/BrandIcons";
import { cn } from "@/lib/utils";

type ChipIcon = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number; monochrome?: boolean }
>;

export interface ChipDef {
  key: string;       // URL slug (short — repos, mcp, etc.)
  label: string;     // display label ("Repos")
  contentTag: string; // underlying content_tag name ("has-github-repo")
  /** Optional brand or lucide icon rendered before the label inside the chip. */
  icon?: ChipIcon;
  /** Canonical brand color for the chip's accent (border-on-active, glow). */
  brandColor?: string;
}

// Brand colors lifted from simple-icons / canonical sources. Generic content
// chips (skills, prompts, tutorials, code, cli, agents, news, announcements)
// fall back to the StarScreener brand orange via undefined → CSS var(--color-brand).
export const CONTENT_CHIPS: ChipDef[] = [
  { key: "repos",         label: "Repos",         contentTag: "has-github-repo",  icon: GithubIcon,      brandColor: "#181717" },
  { key: "skills",        label: "Skills",        contentTag: "has-skill",        icon: SkillIcon },
  { key: "mcp",           label: "MCP",           contentTag: "has-mcp",          icon: McpIcon },
  { key: "prompts",       label: "Prompts",       contentTag: "has-prompt",       icon: PromptIcon },
  { key: "code",          label: "Code",          contentTag: "has-code-block",   icon: Code },
  { key: "tutorials",     label: "Tutorials",     contentTag: "has-tutorial",     icon: TutorialIcon },
  { key: "cli",           label: "CLI",           contentTag: "has-cli",          icon: Terminal },
  { key: "agents",        label: "Agents",        contentTag: "has-agent",        icon: Bot },
  { key: "news",          label: "News",          contentTag: "is-news",          icon: NewsIcon },
  { key: "announcements", label: "Announcements", contentTag: "is-announcement",  icon: AnnouncementIcon },
];

const CHIP_BY_KEY: Map<string, ChipDef> = new Map(
  CONTENT_CHIPS.map((c) => [c.key, c]),
);

/**
 * Parse ?tags=a,b,c from searchParams into a Set of active chip keys.
 * Unknown keys are dropped silently.
 */
export function parseActiveChips(tags: string | null): Set<string> {
  if (!tags) return new Set();
  const out = new Set<string>();
  for (const k of tags.split(",")) {
    const trimmed = k.trim();
    if (CHIP_BY_KEY.has(trimmed)) out.add(trimmed);
  }
  return out;
}

/**
 * Given active chip keys, return the set of content_tags to filter on
 * (OR semantics). Empty set = no filter.
 */
export function chipsToContentTags(active: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const key of active) {
    const chip = CHIP_BY_KEY.get(key);
    if (chip) out.add(chip.contentTag);
  }
  return out;
}

/**
 * Apply chip + show-all filters to a post list.
 *   - activeTags empty + showAll false → hide value_score < 1
 *   - activeTags empty + showAll true  → no filter
 *   - activeTags non-empty             → post must carry ≥1 of the tags
 *     (show-all toggle is ignored when chips are active — user is
 *      already being specific about what they want)
 */
export function applyChipFilter<
  P extends { content_tags?: string[]; value_score?: number },
>(posts: P[], activeTags: Set<string>, showAll: boolean): P[] {
  if (activeTags.size === 0) {
    if (showAll) return posts;
    return posts.filter((p) => (p.value_score ?? 0) >= 1);
  }
  const contentTags = chipsToContentTags(activeTags);
  return posts.filter((p) => {
    if (!Array.isArray(p.content_tags)) return false;
    for (const t of p.content_tags) if (contentTags.has(t)) return true;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ContentTagChipsProps {
  /** Optional count callback — if provided, each chip shows its match count. */
  counts?: Record<string, number>;
  /** Total post count after default filter — rendered in the "show all" hint. */
  hiddenCount?: number;
}

// Shared base classes for every chip. Height bumped to 32px, gap to 2,
// padding to 3 — the user explicitly asked for bigger, more deliberate pills.
const CHIP_BASE = cn(
  "group relative inline-flex items-center gap-2 h-8 px-3 rounded-full",
  "text-[11px] font-mono uppercase tracking-wider",
  "border transition-all duration-150 ease-out",
  "select-none",
);

export function ContentTagChips({ counts, hiddenCount }: ContentTagChipsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTags = parseActiveChips(searchParams.get("tags"));
  const showAll = searchParams.get("showAll") === "1";

  function chipHref(chipKey: string): string {
    const next = new Set(activeTags);
    if (next.has(chipKey)) next.delete(chipKey);
    else next.add(chipKey);
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 0) params.delete("tags");
    else params.set("tags", Array.from(next).join(","));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function showAllHref(): string {
    const params = new URLSearchParams(searchParams.toString());
    if (showAll) params.delete("showAll");
    else params.set("showAll", "1");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function allHref(): string {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tags");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const anyActive = activeTags.size > 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* ALL chip — the master toggle */}
      <Link
        href={allHref()}
        scroll={false}
        aria-pressed={!anyActive}
        className={cn(
          CHIP_BASE,
          !anyActive
            ? "border-brand text-text-inverse font-bold shadow-[0_0_12px_rgba(245,110,15,0.30)]"
            : "border-border-primary text-text-secondary hover:text-text-primary hover:border-brand/60",
        )}
        style={
          !anyActive
            ? {
                background:
                  "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-active) 100%)",
                borderWidth: "1.5px",
              }
            : {
                background:
                  "linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-card) 100%)",
              }
        }
      >
        <span className="font-bold">All</span>
      </Link>

      {CONTENT_CHIPS.map((chip) => {
        const active = activeTags.has(chip.key);
        const count = counts?.[chip.key];
        const Icon = chip.icon;
        // Per-chip accent: brand color if defined, else fall back to the
        // StarScreener brand orange (CSS var). Used for active border + glow.
        const accent = chip.brandColor ?? "var(--color-brand)";

        // Build inline style object — TS-strict, no `any`.
        const activeStyle: CSSProperties = {
          background: chip.brandColor
            ? `linear-gradient(135deg, ${chip.brandColor} 0%, ${chip.brandColor}dd 100%)`
            : "linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-active) 100%)",
          borderColor: accent,
          borderWidth: "1.5px",
          color: "#ffffff",
          boxShadow: chip.brandColor
            ? `0 0 12px ${chip.brandColor}55`
            : "0 0 12px rgba(245, 110, 15, 0.30)",
        };
        const inactiveStyle: CSSProperties = {
          background:
            "linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-card) 100%)",
        };

        return (
          <Link
            key={chip.key}
            href={chipHref(chip.key)}
            scroll={false}
            aria-pressed={active}
            className={cn(
              CHIP_BASE,
              active
                ? "font-bold"
                : "border-border-primary text-text-secondary hover:text-text-primary",
            )}
            style={active ? activeStyle : inactiveStyle}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.borderColor = `${accent}66`;
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.borderColor = "";
              }
            }}
          >
            {Icon ? (
              <span className="inline-flex items-center shrink-0">
                {/* monochrome only flows to brand icons (which define the
                    prop). Lucide icons inherit currentColor and don't know
                    `monochrome` — passing it would leak to the SVG and
                    trigger a React DOM-attribute warning. */}
                <Icon
                  size={16}
                  aria-hidden="true"
                  {...(chip.brandColor ? { monochrome: active } : {})}
                />
              </span>
            ) : null}
            <span>{chip.label}</span>
            {typeof count === "number" ? (
              <span
                className={cn(
                  "ml-0.5 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full",
                  "text-[10px] tabular-nums font-mono",
                  active
                    ? "bg-black/25 text-white/95 font-semibold"
                    : "bg-bg-primary/60 text-text-tertiary",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}

      {/* show all / hide low-value — meta-toggle on the right */}
      <Link
        href={showAllHref()}
        scroll={false}
        aria-pressed={showAll}
        className={cn(
          "ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full",
          "text-[11px] font-mono lowercase tracking-wide",
          "border transition-all duration-150 ease-out",
          showAll
            ? "border-brand/60 text-brand bg-brand/10 hover:bg-brand/15"
            : "border-border-primary text-text-tertiary hover:text-text-primary hover:border-brand/40 bg-bg-secondary/60",
        )}
        title={
          showAll
            ? "Currently showing everything including memes and zero-value posts"
            : `Hiding ${hiddenCount ?? 0} low-value / meme posts — click to show the firehose`
        }
      >
        {showAll ? "hide low-value" : "show all"}
      </Link>
    </div>
  );
}
