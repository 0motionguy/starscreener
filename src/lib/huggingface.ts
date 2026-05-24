// Hugging Face models — trending-side reader.
//
// Reads the `huggingface-trending` payload from the data-store (Redis →
// bundled file → memory) and surfaces the top models scored through the
// new domain pipeline (`hfModelScorer` + `computeCrossDomainMomentum`).
//
// Mirrors the lib/hackernews-trending.ts shape: bundled JSON seeds the
// in-memory cache; refreshHfModelsFromStore() swaps in a fresh Redis
// payload with a 30s rate-limit + in-flight dedupe and never throws.
//
// COLD-START LIMITATION (Chunk E MVP)
//   The HF scraper currently captures a SNAPSHOT (downloads, likes) per
//   run, not deltas. The hf-model scorer wants `downloads7d` + `likes7dAgo`
//   to drive its weeklyDownloadsCapped + likesVelocity components.
//   Until Chunk C ships delta tracking we pass the snapshot `downloads`
//   through as `downloads7d` (log-scaled, so still differentiates hot
//   from cold) and leave `likes7dAgo` undefined so the likesVelocity
//   component is dropped + renormalized away. Documented for reviewer.
//   When Chunk C adds delta tracking, populate the new fields here.

import hfTrendingData from "../../data/huggingface-trending.json";
import { hfModelScorer, type HfModelItem } from "./pipeline/scoring/domain/hf-model";
import { computeCrossDomainMomentum } from "./pipeline/scoring/cross-domain";
import type { DomainItem, DomainKey, ScoredItem } from "./pipeline/scoring/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire shape produced by scripts/scrape-huggingface.mjs. */
export interface HfModelRaw {
  rank?: number;
  id: string; // "owner/name"
  author: string;
  url: string;
  downloads: number;
  likes: number;
  trendingScore: number;
  pipelineTag: string | null;
  libraryName: string | null;
  tags: string[];
  createdAt: string | null;
  lastModified: string | null;
}

export interface HfTrendingFile {
  fetchedAt: string;
  source: string;
  count: number;
  models: HfModelRaw[];
}

/** Scored shape — raw fields + score components surfaced for UI. */
export interface HfModelTrending extends HfModelRaw {
  rawScore: number; // 0..100
  momentum: number; // 0..100 (per-domain percentile)
  primaryMetric: { name: string; value: number; label: string };
  explanation: string;
  /**
   * Synthesized download deltas from `hf-downloads-snapshot:prev:{1,7,30}d`.
   * Zero when the slot hasn't matured yet (day < 2 / 8 / 31 after the
   * snapshot fetcher ships, or when the model id is absent from a slot —
   * e.g., a newly trending model wasn't in yesterday's snapshot).
   */
  downloadsDelta24h: number;
  downloadsDelta7d: number;
  downloadsDelta30d: number;
}

// ---------------------------------------------------------------------------
// LLM-only filter
// ---------------------------------------------------------------------------
//
// HuggingFace's trending feed mixes every `pipeline_tag`: text-generation,
// image-text-to-text, text-to-image, image-to-video, sentence-similarity,
// translation, ASR, etc. The /cat=llms surface must only show LLMs (text +
// multimodal foundation models with text output). 2026-05 audit of top 100
// trending: 29× image-text-to-text (Qwen-VL, LLaVA, DeepSeek-VL,
// Nemotron-VL), 17× text-generation, 13× null, 7× text-to-image,
// 7× text-to-speech, 5× image-to-video, etc. Excluding multimodal LLMs
// dropped yield to 17/100 and lost most current foundation models.
//
// `LLM_PIPELINE_TAGS` is the canonical accept-list. `keepLlmsOnly` is
// applied inside getHfModelsTrending so /cat=llms always sees only LLMs.
// `filterLlmOnly` is the legacy env-gated variant kept for back-compat
// with other consumers (sidebar counts, OG cards, cross-domain joins)
// that read the module-level `trendingFile` directly and may want the
// full mixed set unless HF_LLM_ONLY=true.

const LLM_PIPELINE_TAGS: ReadonlySet<string> = new Set([
  "text-generation",
  "conversational",
  "image-text-to-text",
  "any-to-any",
  "video-text-to-text",
]);

function isLlmOnlyEnabled(): boolean {
  return process.env.HF_LLM_ONLY === "true";
}

function keepLlmsOnly(models: readonly HfModelRaw[]): HfModelRaw[] {
  return models.filter(
    (m) => typeof m.pipelineTag === "string" && LLM_PIPELINE_TAGS.has(m.pipelineTag),
  );
}

function filterLlmOnly(file: HfTrendingFile): HfTrendingFile {
  if (!isLlmOnlyEnabled()) return file;
  const models = keepLlmsOnly(file.models ?? []);
  return { ...file, count: models.length, models };
}

// ---------------------------------------------------------------------------
// In-memory cache (seeded from bundled JSON; swapped by refresh hook)
// ---------------------------------------------------------------------------

let trendingFile: HfTrendingFile = filterLlmOnly(
  hfTrendingData as unknown as HfTrendingFile,
);

export function getHfTrendingFile(): HfTrendingFile {
  return trendingFile;
}

// ---------------------------------------------------------------------------
// Downloads snapshots — populated by refreshHfModelsFromStore
// ---------------------------------------------------------------------------
//
// Slot keys `hf-downloads-snapshot:prev:{1,7,30}d` are written by the
// worker fetcher of the same name. Reader joins today's `downloads` per
// model id against each slot to synthesize 24h/7d/30d deltas. Cold-start
// (slot empty or model id missing): delta defaults to 0 and the /cat=llms
// ranker tiebreaks on absolute downloads — source-native HF trending
// order survives.

interface DownloadsSnapshotEntry {
  downloads: number;
  likes: number;
}

interface DownloadsSnapshotPayload {
  totals?: Record<string, DownloadsSnapshotEntry>;
}

const EMPTY_SNAPSHOT: Record<string, DownloadsSnapshotEntry> = {};
let downloadsPrev1d: Record<string, DownloadsSnapshotEntry> = EMPTY_SNAPSHOT;
let downloadsPrev7d: Record<string, DownloadsSnapshotEntry> = EMPTY_SNAPSHOT;
let downloadsPrev30d: Record<string, DownloadsSnapshotEntry> = EMPTY_SNAPSHOT;

function lowercaseKeys(
  src: Record<string, DownloadsSnapshotEntry> | undefined,
): Record<string, DownloadsSnapshotEntry> {
  if (!src) return EMPTY_SNAPSHOT;
  const out: Record<string, DownloadsSnapshotEntry> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v.downloads === "number") out[k.toLowerCase()] = v;
  }
  return out;
}

function deltaFor(
  modelId: string,
  field: "downloads" | "likes",
  prev: Record<string, DownloadsSnapshotEntry>,
  current: number,
): number {
  const past = prev[modelId.toLowerCase()];
  if (!past) return 0;
  const diff = current - past[field];
  // Negative deltas are noise (model deleted + re-uploaded, snapshot drift)
  // — clamp to 0 so the sort doesn't surface "biggest drop".
  return diff > 0 ? diff : 0;
}

// ---------------------------------------------------------------------------
// Scoring + ranking
// ---------------------------------------------------------------------------

function rawToScorerItem(raw: HfModelRaw): HfModelItem {
  // Cold-start: pass `downloads` (snapshot) as `downloads7d`. Log-scaled
  // weeklyDownloadsCappedScore still surfaces the right ordering. Once
  // delta tracking lands, replace with the actual 7d delta.
  return {
    domainKey: "hf-model",
    id: raw.id,
    joinKeys: { hfModelId: raw.id },
    downloads7d: Math.max(0, raw.downloads ?? 0),
    likes: Math.max(0, raw.likes ?? 0),
    // likes7dAgo intentionally undefined — likesVelocity component is
    // dropped + renormalized away for the MVP. See header comment.
    lastModified: raw.lastModified ?? raw.createdAt ?? undefined,
  };
}

/**
 * Score every model in the current cache, rank by post-cross-domain
 * momentum (descending), and return the top `limit`. Pure — safe to
 * call from server components.
 *
 * Always filters to LLMs (text + multimodal foundation models with text
 * output) regardless of the HF_LLM_ONLY env gate, so /cat=llms is honest
 * about what it shows. The env gate still governs the module-level cache
 * for other consumers that may want the full mixed set.
 */
export function getHfModelsTrending(limit = 100): HfModelTrending[] {
  const raws = keepLlmsOnly(trendingFile.models ?? []);
  if (raws.length === 0) return [];

  const items = raws.map(rawToScorerItem);
  const scored = hfModelScorer.computeRaw(items);

  const perDomain = new Map<DomainKey, ScoredItem<DomainItem>[]>([
    ["hf-model", scored as ScoredItem<DomainItem>[]],
  ]);
  const ranked = computeCrossDomainMomentum(perDomain).get("hf-model") ?? [];

  // ranked preserves input order — splice the raw fields back in by index.
  const enriched: HfModelTrending[] = ranked.map((s, i) => {
    const raw = raws[i]!;
    const dl = Math.max(0, raw.downloads ?? 0);
    return {
      ...raw,
      rawScore: s.rawScore,
      momentum: s.momentum,
      primaryMetric: s.primaryMetric,
      explanation: s.explanation,
      downloadsDelta24h: deltaFor(raw.id, "downloads", downloadsPrev1d, dl),
      downloadsDelta7d: deltaFor(raw.id, "downloads", downloadsPrev7d, dl),
      downloadsDelta30d: deltaFor(raw.id, "downloads", downloadsPrev30d, dl),
    };
  });

  enriched.sort((a, b) => b.momentum - a.momentum);
  if (enriched.length <= limit) return enriched;
  return enriched.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Refresh hook — pull latest huggingface-trending payload from the data-store.
// 30s rate-limit + in-flight dedupe + never-throws. Mirrors trending.ts:190-230.
// ---------------------------------------------------------------------------

let inflight: Promise<{ huggingface: { source: string; ageMs: number } }> | null = null;
let lastRefreshMs = 0;
const MIN_REFRESH_INTERVAL_MS = 30_000;

export async function refreshHfModelsFromStore(): Promise<{
  huggingface: { source: string; ageMs: number };
}> {
  if (inflight) return inflight;
  const sinceLast = Date.now() - lastRefreshMs;
  if (sinceLast < MIN_REFRESH_INTERVAL_MS && lastRefreshMs > 0) {
    return { huggingface: { source: "memory", ageMs: sinceLast } };
  }
  inflight = (async () => {
    try {
      const { getDataStore } = await import("./data-store");
      const store = getDataStore();
      // Pull trending roster + the three downloads-snapshot slots in
      // parallel. Snapshot reads are best-effort: any failure degrades
      // that window's deltas to 0, which falls through to source-native
      // ordering on the /cat=llms surface.
      const [result, snap1d, snap7d, snap30d] = await Promise.all([
        store.read<HfTrendingFile>("huggingface-trending"),
        store.read<DownloadsSnapshotPayload>("hf-downloads-snapshot:prev:1d").catch(() => null),
        store.read<DownloadsSnapshotPayload>("hf-downloads-snapshot:prev:7d").catch(() => null),
        store.read<DownloadsSnapshotPayload>("hf-downloads-snapshot:prev:30d").catch(() => null),
      ]);
      if (result.data && result.source !== "missing") {
        trendingFile = filterLlmOnly(result.data);
      }
      downloadsPrev1d = lowercaseKeys(snap1d?.data?.totals);
      downloadsPrev7d = lowercaseKeys(snap7d?.data?.totals);
      downloadsPrev30d = lowercaseKeys(snap30d?.data?.totals);
      lastRefreshMs = Date.now();
      return { huggingface: { source: result.source, ageMs: result.ageMs } };
    } catch {
      // Never throw from a refresh hook — keep last-known-good cache.
      lastRefreshMs = Date.now();
      return { huggingface: { source: "memory", ageMs: 0 } };
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
