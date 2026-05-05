import type { ShareAspect } from "@/components/top10/share-surface";
import {
  TOP10_CATEGORIES,
  TOP10_METRICS,
  TOP10_THEMES,
  TOP10_WINDOWS,
  type CategoryMeta,
  type Top10Category,
  type Top10Metric,
  type Top10Theme,
  type Top10Window,
} from "@/lib/top10/types";

export interface Top10Selection {
  category: Top10Category;
  window: Top10Window;
  metric: Top10Metric;
  aspect: ShareAspect;
  theme: Top10Theme;
}

const ASPECTS: readonly ShareAspect[] = ["h", "sq", "v", "yt"] as const;

const SUPPORTED_METRICS: Record<Top10Category, Top10Metric[]> = {
  repos: ["cross-signal", "stars", "mentions", "velocity"],
  agents: ["cross-signal", "stars", "mentions", "velocity"],
  movers: ["velocity"],
  llms: ["velocity"],
  mcps: ["velocity"],
  skills: ["velocity"],
  news: ["mentions"],
  funding: ["stars"],
};

function parseCategoryParam(v: string | null): Top10Category | null {
  return v && (TOP10_CATEGORIES as readonly string[]).includes(v)
    ? (v as Top10Category)
    : null;
}

function parseWindowParam(v: string | null): Top10Window | null {
  return v && (TOP10_WINDOWS as readonly string[]).includes(v)
    ? (v as Top10Window)
    : null;
}

function parseMetricParam(v: string | null): Top10Metric | null {
  return v && (TOP10_METRICS as readonly string[]).includes(v)
    ? (v as Top10Metric)
    : null;
}

function parseAspectParam(v: string | null): ShareAspect | null {
  return v && (ASPECTS as readonly string[]).includes(v)
    ? (v as ShareAspect)
    : null;
}

function parseThemeParam(v: string | null): Top10Theme | null {
  return v && (TOP10_THEMES as readonly string[]).includes(v)
    ? (v as Top10Theme)
    : null;
}

export function isMetricSupported(
  category: Top10Category,
  metric: Top10Metric,
): boolean {
  return SUPPORTED_METRICS[category].includes(metric);
}

export function coerceSelection(
  selection: Top10Selection,
  categoryMeta: Record<Top10Category, CategoryMeta>,
): Top10Selection {
  const meta = categoryMeta[selection.category];
  const metric = isMetricSupported(selection.category, selection.metric)
    ? selection.metric
    : meta.defaultMetric;
  return {
    ...selection,
    metric,
  };
}

export function parseTop10Query(
  searchParams: URLSearchParams,
  categoryMeta: Record<Top10Category, CategoryMeta>,
): Top10Selection {
  const category = parseCategoryParam(searchParams.get("cat")) ?? "repos";
  const meta = categoryMeta[category];
  return coerceSelection(
    {
      category,
      window: parseWindowParam(searchParams.get("w")) ?? meta.defaultWindow,
      metric: parseMetricParam(searchParams.get("m")) ?? meta.defaultMetric,
      aspect: parseAspectParam(searchParams.get("aspect")) ?? "h",
      theme: parseThemeParam(searchParams.get("theme")) ?? "dark",
    },
    categoryMeta,
  );
}
