"use client";

// EmptyState - branded empty/cold/error states for source pages and lists.
// Replaces ad-hoc ColdState components scattered across the codebase.
//
// Variants:
//   - no-data        : "Waiting for first scan" (collector ran but produced 0 items)
//   - filter-empty   : "No matches for current filters" (data exists, filter excludes all)
//   - source-down    : "Collector failing - last successful scrape was Xh ago"
//   - unknown-route  : 404 sub-state (used by /not-found)
//
// Tokens: relies on globals.css custom properties (--color-text-tertiary,
// --color-text-secondary, --color-border-primary, --font-display,
// --radius-card) that resolve correctly across light/dark/sepia themes.

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Compass,
  Filter,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export type EmptyStateVariant =
  | "no-data"
  | "filter-empty"
  | "source-down"
  | "unknown-route";

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  /** Override the default title for the variant. */
  title?: string;
  /** Override the default description for the variant. */
  description?: ReactNode;
  /** Additional muted hint rendered below description (font-mono). */
  hint?: ReactNode;
  /** Optional primary action button(s). Rendered in a centered group. */
  cta?: ReactNode;
  /** Source label injected into copy ("Reddit", "DevTo", ...). */
  source?: string;
  /** ISO timestamp of last successful scrape; used by source-down copy. */
  lastSuccessAt?: string;
  className?: string;
}

interface VariantSpec {
  icon: LucideIcon;
  iconClass: string;
  defaultTitle: (source?: string) => string;
  defaultDescription: (params: {
    source?: string;
    ageHours: number | null;
  }) => ReactNode;
}

const VARIANTS: Record<EmptyStateVariant, VariantSpec> = {
  "no-data": {
    icon: Inbox,
    iconClass: "text-text-tertiary",
    defaultTitle: () => "Waiting for first scan",
    defaultDescription: ({ source }) =>
      `The ${labelSource(source) ?? "data"} collector hasn't returned data yet. Check back in a few minutes.`,
  },
  "filter-empty": {
    icon: Filter,
    iconClass: "text-text-tertiary",
    defaultTitle: () => "No matches",
    defaultDescription: () =>
      "No items match the current filters. Try widening the window or removing source filters.",
  },
  "source-down": {
    icon: AlertTriangle,
    iconClass: "text-sig-yellow",
    defaultTitle: () => "Collector unreachable",
    defaultDescription: ({ source, ageHours }) => {
      const ageLabel =
        ageHours === null
          ? "an unknown amount of time"
          : ageHours < 1
            ? "<1h"
            : ageHours < 24
              ? `${Math.round(ageHours)}h`
              : `${Math.round(ageHours / 24)}d`;
      const slug = (source ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
      const cmd = slug ? `npm run scrape:${slug}` : "the local scrape command";
      return (
        <>
          Last successful scrape was {ageLabel} ago. Run <code>{cmd}</code> from
          local to backfill, or check <code>/admin/health</code>.
        </>
      );
    },
  },
  "unknown-route": {
    icon: Compass,
    iconClass: "text-text-tertiary",
    defaultTitle: () => "Page not found",
    defaultDescription: () =>
      "That URL doesn't lead anywhere. Try one of the suggestions below.",
  },
};

function labelSource(source: string | undefined): string | null {
  if (!source) return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  // Capitalise common slugs while preserving custom labels.
  const known: Record<string, string> = {
    reddit: "Reddit",
    devto: "DevTo",
    twitter: "Twitter",
    bluesky: "Bluesky",
    hn: "Hacker News",
    hackernews: "Hacker News",
    producthunt: "ProductHunt",
    arxiv: "arXiv",
  };
  const key = trimmed.toLowerCase();
  return known[key] ?? trimmed;
}

function ageHoursFromIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 0;
  return diffMs / 3_600_000;
}

export function EmptyState({
  variant,
  title,
  description,
  hint,
  cta,
  source,
  lastSuccessAt,
  className,
}: EmptyStateProps) {
  const spec = VARIANTS[variant];
  const Icon = spec.icon;
  const ageHours = ageHoursFromIso(lastSuccessAt);
  const resolvedTitle = title ?? spec.defaultTitle(source);
  const resolvedDescription =
    description ?? spec.defaultDescription({ source, ageHours });

  const containerClass = [
    "border border-dashed border-border-primary rounded-card",
    "p-8 my-6 text-center max-w-2xl mx-auto",
    "bg-bg-secondary/40",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      role={variant === "source-down" ? "alert" : "status"}
      aria-live={variant === "source-down" ? "polite" : "off"}
      className={containerClass}
    >
      <div className="flex flex-col items-center">
        <Icon
          aria-hidden="true"
          width={48}
          height={48}
          className={spec.iconClass}
          strokeWidth={1.5}
        />
        <h2 className="font-display text-2xl font-bold mt-4 text-text-primary">
          {resolvedTitle}
        </h2>
        <p className="text-text-secondary text-base mt-2">
          {resolvedDescription}
        </p>
        {hint ? (
          <div className="text-text-tertiary text-sm mt-4 font-mono">
            {hint}
          </div>
        ) : null}
        {cta ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {cta}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default EmptyState;
