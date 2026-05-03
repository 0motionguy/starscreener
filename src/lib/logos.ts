// Logo URL helpers — keeps the rules for "where does <entity>'s avatar
// come from" in one file so feed surfaces can render logos consistently
// without each one rolling its own GitHub-vs-Clearbit-vs-Gravatar logic.
//
// All helpers return either a full URL or null. Callers feed both into
// <EntityLogo />, which renders the image when present and a deterministic
// 1-letter monogram tile otherwise — so a missing logo never leaves a
// blank slot on the page.

import { extractDomain, resolveLogoUrl } from "./logo-url";

/**
 * GitHub owner avatar — 40px is the canonical small size; pass other
 * sizes for different surface densities. Public, no auth, very stable.
 */
export function repoLogoUrl(fullName: string | null | undefined, size = 40): string | null {
  if (!fullName) return null;
  const owner = fullName.split("/", 1)[0]?.trim();
  if (!owner) return null;
  return `https://github.com/${encodeURIComponent(owner)}.png?size=${size}`;
}

/**
 * Owner avatar derived from an `owner/name` pair. Equivalent to
 * repoLogoUrl when both halves are spliced; offered separately for sites
 * that store owner + name as discrete fields.
 */
export function repoOwnerLogoUrl(owner: string | null | undefined, size = 40): string | null {
  if (!owner) return null;
  return `https://github.com/${encodeURIComponent(owner)}.png?size=${size}`;
}

/**
 * Repo logo for display surfaces. Prefer a captured/enriched avatar when the
 * pipeline already has one; otherwise fall back to the public GitHub owner
 * avatar derived from `owner/name`.
 */
export function repoDisplayLogoUrl(
  fullName: string | null | undefined,
  providedUrl: string | null | undefined,
  size = 40,
): string | null {
  const trimmed = typeof providedUrl === "string" ? providedUrl.trim() : "";
  if (trimmed) return trimmed;
  return repoLogoUrl(fullName, size);
}

/**
 * Profile avatar for local profile pages. Handles may arrive with or without
 * `@`; we use the GitHub avatar endpoint because STARSCREENER identities are
 * repo/maintainer centric and the endpoint has a stable monogram fallback.
 */
export function profileLogoUrl(handle: string | null | undefined, size = 40): string | null {
  if (!handle) return null;
  const clean = handle.trim().replace(/^@+/, "");
  if (!clean) return null;
  return repoOwnerLogoUrl(clean, size);
}

const HUGGING_FACE_MARK =
  "https://huggingface.co/front/assets/huggingface_logo-noborder.svg";

/**
 * Hugging Face entity logo. We deliberately do NOT use
 * `https://huggingface.co/<author>/avatar.png`: many authors/orgs do not
 * expose that endpoint consistently, which leaves the three feature cards
 * and feed rows with broken image icons. The platform mark is stable and
 * still gives every HF row a recognizable logo.
 */
export function huggingFaceLogoUrl(): string {
  return HUGGING_FACE_MARK;
}

// HuggingFace org/user → real homepage domain. Lets the model/dataset/space
// rows show the actual project's logo (NVIDIA, Google, Meta, DeepSeek, ...)
// instead of the generic HF mark. Lowercase keys after normalizeHfAuthor()
// (lowercased + underscores/spaces → hyphens). Unmapped authors get the
// EntityLogo monogram tile — a colored initial — instead of a generic
// Google-favicon globe, which looked broken for "cyankiwi" / "Jackrong" /
// other random user accounts.
const HF_AUTHOR_DOMAIN_MAP: ReadonlyMap<string, string> = new Map([
  // Big tech
  ["nvidia", "nvidia.com"],
  ["nvidialabs", "nvidia.com"],
  ["google", "google.com"],
  ["google-research", "google.com"],
  ["googleai", "google.com"],
  ["deepmind", "deepmind.com"],
  ["meta-llama", "meta.com"],
  ["facebook", "meta.com"],
  ["facebookresearch", "meta.com"],
  ["microsoft", "microsoft.com"],
  ["apple", "apple.com"],
  ["mlx-community", "apple.com"],
  ["amazon", "aws.amazon.com"],
  ["aws", "aws.amazon.com"],
  ["intel", "intel.com"],
  ["ibm", "ibm.com"],
  ["ibm-granite", "ibm.com"],
  ["xiaomi", "xiaomi.com"],
  ["xiaomimimo", "xiaomi.com"],
  ["baidu", "baidu.com"],

  // AI labs
  ["mistralai", "mistral.ai"],
  ["mistral-ai", "mistral.ai"],
  ["mistral", "mistral.ai"],
  ["anthropic", "anthropic.com"],
  ["openai", "openai.com"],
  ["deepseek-ai", "deepseek.com"],
  ["deepseek", "deepseek.com"],
  ["qwen", "qwenlm.ai"],
  ["tongyi-mai", "qwenlm.ai"],
  ["alibaba-nlp", "alibaba.com"],
  ["alibaba", "alibaba.com"],
  ["stabilityai", "stability.ai"],
  ["stability-ai", "stability.ai"],
  ["tencent", "tencent.com"],
  ["tencentarc", "tencent.com"],
  ["bytedance", "bytedance.com"],
  ["bytedance-research", "bytedance.com"],
  ["bigcode", "bigcode-project.org"],
  ["bigscience", "bigscience.huggingface.co"],
  ["xai-org", "x.ai"],
  ["x-ai", "x.ai"],
  ["nousresearch", "nousresearch.com"],
  ["allenai", "allenai.org"],
  ["snowflake", "snowflake.com"],
  ["databricks", "databricks.com"],
  ["cohere", "cohere.com"],
  ["cohereforai", "cohere.com"],
  ["upstage", "upstage.ai"],
  ["jinaai", "jina.ai"],
  ["jina-ai", "jina.ai"],
  ["sentence-transformers", "sbert.net"],
  ["unsloth", "unsloth.ai"],
  ["bartowski", "bartowski.dev"],
  ["thudm", "thudm.org"],
  ["zhipu", "zhipuai.cn"],
  ["zhipuai", "zhipuai.cn"],
  ["zai-org", "z.ai"],
  ["z-lab", "z.ai"],
  ["01-ai", "01.ai"],
  ["yi-1-5", "01.ai"],
  ["lmsys", "lmsys.org"],
  ["fireworks-ai", "fireworks.ai"],
  ["nomic-ai", "nomic.ai"],
  ["llamaindex", "llamaindex.ai"],
  ["modal-labs", "modal.com"],
  ["replicate", "replicate.com"],
  ["runwayml", "runwayml.com"],
  ["black-forest-labs", "blackforestlabs.ai"],
  ["minimaxai", "minimaxi.com"],
  ["minimax-ai", "minimaxi.com"],
  ["moonshotai", "moonshot.cn"],
  ["sensenova", "sensetime.com"],
  ["sensetime", "sensetime.com"],
  ["openbmb", "openbmb.cn"],
  ["lightricks", "lightricks.com"],
  ["kai-os", "kaiostech.com"],
  ["poolside", "poolside.ai"],
  ["inclusionai", "inclusionai.com"],
  ["k2-fsa", "k2-fsa.org"],
  ["sbintuitions", "sbintuitions.sakura.ne.jp"],
  ["openmed", "openmed.ai"],
  ["llamafactory", "llamafactory.io"],
]);

function normalizeHfAuthor(author: string | null | undefined): string {
  return typeof author === "string"
    ? author.trim().toLowerCase().replace(/[_\s]+/g, "-")
    : "";
}

/**
 * Project-specific logo for a HuggingFace org/user. Returns the favicon URL
 * for a mapped domain (NVIDIA, Google, Meta, DeepSeek, etc.) or null when
 * the author isn't recognised — null lets EntityLogo render its monogram
 * tile (colored initial), which looks intentional and consistent. We
 * deliberately do NOT slug-guess random author names into `{slug}.com`
 * favicons because Google's service serves a generic globe for unknown
 * domains, not a 404 — so misses look like "broken globe icons" rather
 * than letting the monogram fallback kick in.
 */
export function huggingFaceAuthorLogoUrl(
  author: string | null | undefined,
  size: number = 64,
): string | null {
  const slug = normalizeHfAuthor(author);
  if (!slug) return null;
  const mapped = HF_AUTHOR_DOMAIN_MAP.get(slug);
  if (!mapped) return null;
  const sz = Math.max(16, Math.min(256, Math.round(size)));
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(mapped)}&sz=${sz}`;
}

export interface McpLogoInput {
  logoUrl?: string | null;
  linkedRepo?: string | null;
  url?: string | null;
  title?: string | null;
  vendor?: string | null;
  sourceLabel?: string | null;
}

function hasInvalidLogoDomain(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/\.invalid(?:[/?#]|$)/i.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    const faviconDomain = url.searchParams.get("domain");
    const extracted = extractDomain(faviconDomain);
    return Boolean(extracted?.endsWith(".invalid"));
  } catch {
    return false;
  }
}

function cleanLogoInput(input: string | null | undefined): string | null {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed || hasInvalidLogoDomain(trimmed)) return null;
  return trimmed;
}

function mcpSourceHomepage(sourceLabel: string | null | undefined): string | null {
  const lower = sourceLabel?.trim().toLowerCase();
  if (!lower) return null;
  if (lower === "mcp" || lower === "mcp.so" || lower === "mcp registries") {
    return "https://mcp.so";
  }
  if (lower === "smithery" || lower === "smthy") return "https://smithery.ai";
  if (lower === "glama") return "https://glama.ai";
  if (lower === "pulsemcp" || lower === "pulse") return "https://pulsemcp.com";
  return null;
}

/**
 * MCP logo resolver for leaderboards, detail pages, and feature cards.
 * Order: explicit logo, linked GitHub repo owner, registry/favicon URL,
 * vendor-name favicon, protocol homepage favicon.
 */
export function mcpEntityLogoUrl(
  item: McpLogoInput,
  size = 40,
): string | null {
  const explicit = cleanLogoInput(item.logoUrl);
  if (explicit) return explicit;

  const repoAvatar = repoLogoUrl(item.linkedRepo, size);
  if (repoAvatar) return repoAvatar;

  const urlFavicon = resolveLogoUrl(
    cleanLogoInput(item.url),
    null,
    size,
  );
  if (urlFavicon) return urlFavicon;

  const sourceFavicon = resolveLogoUrl(mcpSourceHomepage(item.sourceLabel), "MCP", size);
  if (sourceFavicon) return sourceFavicon;

  return resolveLogoUrl("https://modelcontextprotocol.io", "MCP", size);
}

/**
 * npm package logo — npm itself doesn't expose package icons, so we
 * fall back to the linked GitHub owner's avatar. Returns null when no
 * GitHub link is attached.
 */
export function npmLogoUrl(linkedRepoFullName: string | null | undefined, size = 40): string | null {
  return repoLogoUrl(linkedRepoFullName, size);
}

/**
 * Per-source user avatar. Pass through the data when the scraper
 * captured one; otherwise return null and let the monogram render.
 *
 * Sources that ship avatars in their JSON:
 *   - bluesky (`author.avatar`)
 *   - devto (`author.profile_image`)
 *   - twitter (`author.avatarUrl`)
 *   - lobsters (`avatar_url` if scraped)
 * Sources that don't expose avatars at all:
 *   - hn (HN has no concept of avatars)
 *   - reddit (we don't currently fetch user metadata)
 */
export function userLogoUrl(providedUrl: string | null | undefined): string | null {
  if (!providedUrl) return null;
  const trimmed = providedUrl.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * Company logo via Google's favicon service. We delegate to the existing
 * `lib/logo-url.ts` helpers (Clearbit was retired 2023; Google Favicons
 * is the reliable free option). Accepts either a bare domain or a full
 * URL — see logo-url.ts for parsing rules. Returns null when no domain
 * can be extracted, in which case EntityLogo falls back to the monogram.
 */
export {
  logoFromDomain as companyLogoUrl,
  logoFromDomain as urlLogoUrl,
  resolveLogoUrl,
} from "./logo-url";

/**
 * Deterministic monogram color picked from the entity's name — used by
 * EntityLogo when no source URL is available so the fallback isn't a
 * dead grey square. 8 hues give enough variety on dense feed views.
 */
const MONOGRAM_PALETTE = [
  { bg: "rgba(146, 151, 246, 0.16)", border: "rgba(146, 151, 246, 0.4)", fg: "#a8acf8" },
  { bg: "rgba(58, 214, 197, 0.16)", border: "rgba(58, 214, 197, 0.4)", fg: "#5fe6d3" },
  { bg: "rgba(251, 191, 36, 0.16)", border: "rgba(251, 191, 36, 0.4)", fg: "#f5d778" },
  { bg: "rgba(244, 114, 182, 0.16)", border: "rgba(244, 114, 182, 0.4)", fg: "#f9b4d9" },
  { bg: "rgba(34, 197, 94, 0.16)", border: "rgba(34, 197, 94, 0.4)", fg: "#5be08e" },
  { bg: "rgba(255, 110, 15, 0.16)", border: "rgba(255, 110, 15, 0.4)", fg: "#ff9447" },
  { bg: "rgba(167, 139, 250, 0.16)", border: "rgba(167, 139, 250, 0.4)", fg: "#c1abf9" },
  { bg: "rgba(56, 189, 248, 0.16)", border: "rgba(56, 189, 248, 0.4)", fg: "#7dd3fc" },
] as const;

export type MonogramTone = (typeof MONOGRAM_PALETTE)[number];

export function monogramTone(name: string | null | undefined): MonogramTone {
  if (!name) return MONOGRAM_PALETTE[0];
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  }
  return MONOGRAM_PALETTE[hash % MONOGRAM_PALETTE.length];
}

/**
 * Single-character monogram letter — strips leading `r/`, `@`, `/` so
 * `r/ClaudeCode` → `C` and `@vercel` → `V`. Always uppercase.
 */
export function monogramInitial(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = name.replace(/^[@\/]+/, "").replace(/^r\//i, "").trim();
  return (cleaned.charAt(0) || "?").toUpperCase();
}
