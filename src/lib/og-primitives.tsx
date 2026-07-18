// StarScreener — shared primitives for ImageResponse OG cards
//
// ImageResponse tries to fetch Noto Sans glyphs for any character outside the
// default Latin subset — including ★ and ●. Those fetches hit Google Fonts
// and 400 on unrecognised glyph subsets, so we render the shapes as inline
// SVG instead. Same visual, no external font calls.
//
// This module is imported by every `opengraph-image.tsx` / `twitter-image.tsx`
// route. The helpers below centralise the wordmark, the bottom accent strip,
// the "not found" fallback card, and a couple of pure string utilities so
// each card stays consistent without duplicating markup.

import type { ReactElement, ReactNode } from "react";

import { OG_COLORS } from "@/lib/seo";

interface StarProps {
  size: number;
  color: string;
}

/** Five-point filled star, rendered as inline SVG. */
export function StarMark({ size, color }: StarProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "flex" }}
    >
      <path
        d="M12 2l2.9 6.9L22 10l-5.5 4.5 1.9 7.5L12 18l-6.4 4 1.9-7.5L2 10l7.1-1.1L12 2z"
        fill={color}
      />
    </svg>
  );
}

/** Small filled dot — used for "live" indicator. */
export function Dot({ size, color }: StarProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "flex" }}
    >
      <circle cx="12" cy="12" r="10" fill={color} />
    </svg>
  );
}

interface WordmarkProps {
  /** Font size of the word text. Star glyph scales alongside. */
  fontSize?: number;
  /** Override the word colour. Defaults to brand orange. */
  color?: string;
  /** Word next to the star. Defaults to TrendingRepo (legacy brand). */
  label?: string;
}

/**
 * Shared wordmark lockup: star glyph + "TrendingRepo" text. Used in every
 * OG card footer; keeping this in one place means rebrands ripple to all
 * share surfaces in a single diff.
 */
export function Wordmark({
  fontSize = 28,
  color = OG_COLORS.brand,
  label = "TrendingRepo",
}: WordmarkProps = {}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.max(8, Math.round(fontSize * 0.35)),
        color,
        fontSize,
        fontWeight: 800,
      }}
    >
      <StarMark size={fontSize + 2} color={color} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Full-bleed 8px orange strip anchored at the bottom of the card. Acts as
 * the brand signature on every share image regardless of the composition
 * above it.
 */
export function AccentStrip({
  color = OG_COLORS.brand,
}: { color?: string } = {}): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 8,
        backgroundColor: color,
        display: "flex",
      }}
    />
  );
}

interface NotFoundCardProps {
  /** Big centred headline — "Idea not found", "Collection not found", etc. */
  headline: string;
  /** Optional secondary line below the headline. */
  subline?: string;
  /** Optional hint rendered last in monospace (e.g. the slug that was missing). */
  hint?: string;
}

/**
 * Generic fallback card used when a route can't resolve its data (unknown
 * slug/id/handle). Never throws, so social crawlers always get a real PNG
 * even for stale links.
 */
export function NotFoundCard({
  headline,
  subline,
  hint,
}: NotFoundCardProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: OG_COLORS.bg,
        color: OG_COLORS.textPrimary,
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      <Wordmark fontSize={44} />
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 56,
          fontWeight: 700,
        }}
      >
        {headline}
      </div>
      {subline && (
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 24,
            color: OG_COLORS.textSecondary,
            maxWidth: 900,
            textAlign: "center",
          }}
        >
          {subline}
        </div>
      )}
      {hint && (
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 22,
            color: OG_COLORS.textTertiary,
            fontFamily: "Geist Mono",
          }}
        >
          {hint}
        </div>
      )}
      <AccentStrip />
    </div>
  );
}

/**
 * Right-hand card shell that every dynamic OG surface shares: dark bg, brand
 * accent strip, consistent padding. Children are free to lay themselves out
 * in a flex column.
 */
export function CardFrame({
  padding = "48px 72px 56px 72px",
  accent = OG_COLORS.brand,
  children,
}: {
  padding?: string;
  /** AccentStrip color — card archetypes (e.g. hf_models) restyle the frame. */
  accent?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: OG_COLORS.bg,
        color: OG_COLORS.textPrimary,
        padding,
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      {children}
      <AccentStrip color={accent} />
    </div>
  );
}

/**
 * Truncate `text` to `maxChars`, appending an ellipsis. Defensive against
 * tiny limits so callers can pass `maxChars: 1` without an out-of-bounds.
 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return text.slice(0, maxChars - 1).trimEnd() + "…";
}

/** GitHub-linguist hues for the languages we realistically encounter. */
const LANGUAGE_DOT_COLORS: Record<string, string> = {
  typescript: "#3178C6",
  javascript: "#F1E05A",
  python: "#3572A5",
  rust: "#DEA584",
  go: "#00ADD8",
  c: "#555555",
  "c++": "#F34B7D",
  "c#": "#178600",
  java: "#B07219",
  kotlin: "#A97BFF",
  swift: "#F05138",
  ruby: "#701516",
  php: "#4F5D95",
  dart: "#00B4AB",
  zig: "#EC915C",
  lua: "#000080",
  shell: "#89E051",
  html: "#E34C26",
  css: "#663399",
  "jupyter notebook": "#DA5B0B",
  elixir: "#6E4A7E",
  scala: "#C22D40",
  haskell: "#5E5086",
  ocaml: "#EF7A08",
  julia: "#A270BA",
  r: "#198CE7",
  vue: "#41B883",
  svelte: "#FF3E00",
  markdown: "#083FA1",
  mdx: "#FCB32C",
};

/** Dot colour for a language chip; falls back to brand orange. */
export function languageDotColor(language: string): string {
  return LANGUAGE_DOT_COLORS[language.toLowerCase()] ?? OG_COLORS.brand;
}

const AVATAR_TIMEOUT_MS = 1500;
const AVATAR_MAX_BYTES = 400_000;
const avatarCache = new Map<string, Promise<string | null>>();

/**
 * Fetch an owner avatar and return it as a data URI for satori `<img>`.
 *
 * Pre-fetching (instead of letting satori resolve the remote URL mid-render)
 * means a slow or broken avatar host degrades to the monogram fallback
 * instead of failing the whole ImageResponse. Successes are cached for the
 * process lifetime; failures are evicted so transient errors retry on the
 * next render.
 */
export function fetchAvatarDataUri(
  rawUrl: string | null | undefined,
  size = 160,
): Promise<string | null> {
  if (!rawUrl) return Promise.resolve(null);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return Promise.resolve(null);
  }
  if (url.protocol !== "https:") return Promise.resolve(null);
  url.searchParams.set("size", String(size));
  const key = url.toString();
  const hit = avatarCache.get(key);
  if (hit) return hit;
  const pending = (async (): Promise<string | null> => {
    const res = await fetch(key, {
      signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > AVATAR_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  })()
    .catch(() => null)
    .then((result) => {
      if (result === null) avatarCache.delete(key);
      return result;
    });
  avatarCache.set(key, pending);
  return pending;
}

/**
 * Owner avatar tile with a first-letter monogram fallback. Pass the result
 * of `fetchAvatarDataUri` — never a remote URL — so renders stay hermetic.
 */
export function OwnerBadge({
  avatarUri,
  owner,
  size = 112,
  radius = 24,
}: {
  avatarUri: string | null;
  owner: string;
  size?: number;
  radius?: number;
}): ReactElement {
  if (avatarUri) {
    return (
      <img
        src={avatarUri}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          border: `1px solid ${OG_COLORS.border}`,
          backgroundColor: OG_COLORS.bgSecondary,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: `1px solid ${OG_COLORS.border}`,
        backgroundColor: OG_COLORS.brandDim,
        color: OG_COLORS.brand,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.44),
        fontWeight: 800,
      }}
    >
      {(owner[0] ?? "?").toUpperCase()}
    </div>
  );
}

/** Compact number formatter — 12345 → "12.3k", 2_100_000 → "2.1M". */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000).toLocaleString("en-US")}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

/* ---------------------------------------------------------------------------
 * Named OG shell aliases — used by `/api/og/referral/[handle]`. They are
 * thin re-exports of the existing CardFrame/Wordmark/AccentStrip primitives
 * with explicit roles ("frame", "header", "footer") so the referral route
 * reads top-down and so future cards can adopt the same vocabulary without
 * having to remember which legacy name maps to which slot.
 *
 * `CardFrame` already provides the dark-bg + bottom-accent shell that every
 * card uses, so OgFrame is a re-export with an aspect-aware default
 * (1200×630 — the symmetric Twitter `summary_large_image` size used for
 * link unfurls). OgHeader/OgFooter are tiny layout wrappers that pin the
 * StarMark + handle/url to consistent positions; they keep the new code
 * surgical without touching `star-activity` (which builds its own header
 * inline because of its richer layout requirements).
 * ------------------------------------------------------------------------- */

interface OgFrameProps {
  width?: number;
  height?: number;
  padding?: string;
  children: ReactNode;
}

/**
 * Top-level shell for a 1200×630 dark-gradient OG card. The existing
 * `CardFrame` already lays out the dark bg + bottom accent strip; OgFrame
 * is a friendlier-named alias that defaults its padding to a comfortable
 * 64px gutter for the share-card layout.
 */
export function OgFrame({
  padding = "56px 72px 64px 72px",
  children,
}: OgFrameProps): ReactElement {
  return <CardFrame padding={padding}>{children}</CardFrame>;
}

interface OgHeaderProps {
  /** Optional secondary line shown to the right of the wordmark (handle). */
  handle?: string;
  /** Override the wordmark label (defaults to TrendingRepo). */
  label?: string;
}

/**
 * Header strip for OG cards: brand wordmark on the left, optional handle
 * (`@mirko`) on the right in monospace. Renders as a 100%-width flex row
 * sized to leave room for the body composition below.
 */
export function OgHeader({
  handle,
  label,
}: OgHeaderProps = {}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      }}
    >
      <Wordmark fontSize={32} label={label} />
      {handle ? (
        <span
          style={{
            display: "flex",
            fontFamily: "Geist Mono",
            fontSize: 22,
            color: OG_COLORS.textTertiary,
            letterSpacing: 0.6,
          }}
        >
          {`@${handle}`}
        </span>
      ) : null}
    </div>
  );
}

interface OgFooterProps {
  /** URL surfaced on the left, typically `trendingrepo.com?ref=<code>`. */
  url: string;
  /** Right-side tagline; defaults to the project's site tagline. */
  tagline?: string;
}

/**
 * Footer strip — URL + tagline, sat at the bottom of an OgFrame via
 * `marginTop: "auto"`. Placed before the AccentStrip injected by CardFrame
 * so the strip sits underneath the text band.
 */
export function OgFooter({
  url,
  tagline = "The trend map for open source",
}: OgFooterProps): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "auto",
        width: "100%",
        fontFamily: "Geist Mono",
        fontSize: 20,
        color: OG_COLORS.textTertiary,
        letterSpacing: 0.5,
      }}
    >
      <span style={{ display: "flex" }}>{url}</span>
      <span style={{ display: "flex" }}>{tagline}</span>
    </div>
  );
}
