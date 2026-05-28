// Shared factory for the worker-written editorial-overview slugs that back the
// GEO answer-surfaces (categories / compare / alternatives). Each surface has a
// thin reader (src/lib/editorial-{categories,compare,alternatives}.ts) that just
// binds this factory to its slug.
//
// Mirrors src/lib/editorial-store.ts (the /best reader, which predates this and
// is intentionally left as-is): a createPayloadReader over a single slug with
// defensive normalization + a sync per-key getter after an async refresh. The
// pages await refresh<Surface>FromStore() in their Promise.all; the deterministic
// intro builders then prefer getEditorial<Surface>(key)?.overview, with an honest
// fallback when the slug is empty (no Redis locally, or the worker hasn't run).

import { createPayloadReader } from "./data-store-reader";

export interface EditorialItem {
  /** Storage key for this entry (category slug / compare pair key / repo fullName). */
  slug: string;
  title: string;
  /** ≤12-word expert framing. Optional (meta-description use). */
  tagline?: string;
  /** 2-4 sentence evergreen expert overview. */
  overview: string;
}

export interface EditorialPayload {
  computedAt: string;
  /** Provider that produced this run, or "template" for the LLM-less fallback. */
  generator: "kimi" | "nanogpt" | "openrouter" | "template";
  model?: string;
  items: Record<string, EditorialItem>;
}

function emptyPayload(): EditorialPayload {
  return { computedAt: "", generator: "template", items: {} };
}

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

function normalizePayload(input: unknown): EditorialPayload {
  if (!input || typeof input !== "object") return emptyPayload();
  const p = input as Partial<EditorialPayload>;
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

/**
 * Bind the editorial reader pattern to a data-store slug. Returns the standard
 * PayloadReader surface plus `getItem(key)` — the per-entry sync getter the
 * intro builders use.
 */
export function createEditorialReader(key: string) {
  const reader = createPayloadReader<EditorialPayload>({
    key,
    emptyPayload: emptyPayload(),
    normalize: normalizePayload,
  });
  return {
    ...reader,
    getItem: (k: string): EditorialItem | null => reader.getPayload().items[k] ?? null,
  };
}
