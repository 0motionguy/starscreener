// App-side reader for the worker's `editorial-best` slug — LLM-written expert
// overviews for the /best/[topic] answer-surfaces.
//
// Mirrors src/lib/consensus-verdicts.ts: a createPayloadReader over a single
// slug, defensive normalization, sync getter after an async refresh. The page
// awaits refreshEditorialBestFromStore() in its Promise.all; buildBestIntro
// (src/lib/best-topics.ts) then prefers getEditorialBest(slug)?.overview over
// the deterministic intro, with an honest fallback when the slug is empty
// (e.g. no Redis locally, or the worker hasn't run yet).

import { createPayloadReader } from "./data-store-reader";

export interface EditorialItem {
  slug: string;
  title: string;
  /** ≤12-word expert framing. Optional (meta-description use). */
  tagline?: string;
  /** 2-4 sentence evergreen expert overview. */
  overview: string;
}

export interface EditorialBestPayload {
  computedAt: string;
  /** Provider that produced this run, or "template" for the LLM-less fallback. */
  generator: "kimi" | "nanogpt" | "openrouter" | "template";
  model?: string;
  items: Record<string, EditorialItem>;
}

const EMPTY: EditorialBestPayload = {
  computedAt: "",
  generator: "template",
  items: {},
};

function normalizeItem(input: unknown): EditorialItem | null {
  if (!input || typeof input !== "object") return null;
  const it = input as Partial<EditorialItem>;
  if (typeof it.slug !== "string" || !it.slug) return null;
  if (typeof it.overview !== "string" || it.overview.trim().length === 0) return null;
  return {
    slug: it.slug,
    title: typeof it.title === "string" ? it.title : it.slug,
    tagline: typeof it.tagline === "string" && it.tagline.trim() ? it.tagline : undefined,
    overview: it.overview,
  };
}

function normalizePayload(input: unknown): EditorialBestPayload {
  if (!input || typeof input !== "object") return EMPTY;
  const p = input as Partial<EditorialBestPayload>;
  const items: Record<string, EditorialItem> = {};
  if (p.items && typeof p.items === "object") {
    for (const [k, v] of Object.entries(p.items as Record<string, unknown>)) {
      const item = normalizeItem(v);
      if (item) items[k] = item;
    }
  }
  return {
    computedAt: typeof p.computedAt === "string" ? p.computedAt : "",
    generator:
      p.generator === "kimi" || p.generator === "nanogpt" || p.generator === "openrouter"
        ? p.generator
        : "template",
    model: typeof p.model === "string" ? p.model : undefined,
    items,
  };
}

const reader = createPayloadReader<EditorialBestPayload>({
  key: "editorial-best",
  emptyPayload: EMPTY,
  normalize: normalizePayload,
});

export const refreshEditorialBestFromStore = reader.refresh;

export const getEditorialBestPayload = reader.getPayload;

/** The LLM overview for a /best topic, or null when none is stored yet. */
export function getEditorialBest(slug: string): EditorialItem | null {
  return reader.getPayload().items[slug] ?? null;
}

export const _resetEditorialCacheForTests = reader.reset;
