"use client";

// TrendingRepo — SharePanel: reusable right-rail share surface.
//
// Consolidates three near-identical right-rail share panels that previously
// lived inside tier-list, top-10, and star-history tool pages. One component,
// three consumers, configured by props.
//
// Layout (top to bottom):
//   1. .panel-head      — "// SHARE" eyebrow + optional status indicator
//   2. .share-status    — ready-to-post badge (variant="ranking" only)
//   3. .size-grid       — 1..4 PNG export sizes as chips (active gets accent)
//   4. .theme-grid      — optional theme swatch chips (top-10 only today)
//   5. preview slot     — optional render-slot for live preview (ranking lockup)
//   6. .btn.primary.lg  — primary CTA full-width (download/publish/save)
//   7. .share-secondary-row — Copy link · Post on X · Post on Reddit
//   8. URL fields       — PERMALINK · EMBED · TRACKING (.url-field rows)
//   9. .steps-list      — "// HOW IT WORKS" footer (numbered, accent numbers)
//
// All slots are independent — pass only what the surface needs. The shell
// adapts: no themes => no theme grid; no embed string => no URL fields; etc.
//
// Tokens read via var(--*) — no inline hex. Icons via <Icon name="..." />
// from the canonical icon registry. Brand glyphs (X / Reddit) via <SourceLogo>.
//
// See docs/DESIGN-SYSTEM.md §7 (Component primitives), §8 (Icon system).

import type { ReactNode } from "react";

import { Icon, SourceLogo } from "@/lib/icons";
import { absoluteUrl } from "@/lib/seo";
import { toast } from "@/lib/toast";
import { buildShareToXUrl } from "@/lib/twitter/outbound/share";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SharePanelSize {
  /** Stable id used by onSelectSize. */
  id: string;
  /** Caption text, e.g. "X POST". Will be uppercased visually. */
  label: string;
  /** Width in CSS px (1200 for X, 1080 for IG, etc.). Used as caption. */
  w: number;
  /** Height in CSS px. */
  h: number;
}

export interface SharePanelTheme {
  /** Stable id used by onSelectTheme. */
  id: string;
  /** Human label, e.g. "Dark", "Cyberpunk". */
  label: string;
  /**
   * Two-color swatch: [background, accent]. Rendered as a 32x16 chip with
   * background fill + 4-wide right edge of accent. Any CSS color string.
   */
  swatch: [string, string];
}

export interface SharePanelCta {
  label: string;
  /** Icon name from /public/icons/. Defaults to "download". */
  icon?: string;
  onClick?: () => void;
  /** Render as anchor instead of button. */
  href?: string;
  /** Triggers browser download when href is set. */
  download?: string;
  disabled?: boolean;
}

export interface SharePanelStep {
  label: string;
  /** Optional secondary line below label. */
  hint?: string;
}

export interface SharePanelProps {
  /** Panel head copy (e.g. "Share this ranking"). When omitted, defaults to "Share". */
  title?: string;
  /**
   * Visual variant. "ranking" gives the richer treatment (status row + bigger CTA),
   * "default" is the slim tier-list / star-history layout.
   */
  variant?: "default" | "ranking";
  /** Optional status label rendered as a green-pulse pill ("Ready to post"). */
  statusLabel?: string;
  /** Visual status tone — controls dot color. Defaults to "live". */
  statusTone?: "live" | "warn" | "cold";

  // ── PNG export sizes ──────────────────────────────────────────────────
  sizes?: SharePanelSize[];
  activeSize?: string;
  onSelectSize?: (id: string) => void;

  // ── Theme grid ────────────────────────────────────────────────────────
  themes?: SharePanelTheme[];
  activeTheme?: string;
  onSelectTheme?: (id: string) => void;

  // ── Preview slot ──────────────────────────────────────────────────────
  preview?: ReactNode;

  // ── Primary CTA ───────────────────────────────────────────────────────
  primaryCta?: SharePanelCta;

  // ── Secondary share actions ───────────────────────────────────────────
  /** Absolute URL the share buttons publish. REQUIRED when any of the
   *  secondary buttons (copyLink / postOnX / postOnReddit) is enabled. */
  shareUrl?: string;
  /** Pre-filled tweet body for the X intent. */
  shareText?: string;
  /** Hashtags for the X intent (no leading #). */
  hashtags?: string[];
  /** Render the "Copy link" button. Default false. */
  copyLink?: boolean;
  /** Render the "Post on X" button. Default false. */
  postOnX?: boolean;
  /** Render the "Post on Reddit" button. Default false — opens reddit.com/submit. */
  postOnReddit?: boolean;
  /** Optional Reddit subreddit hint (e.g. "opensource"). Routes to /r/<sub>/submit. */
  redditSubreddit?: string;

  // ── URL fields ────────────────────────────────────────────────────────
  /** Canonical permalink shown in the PERMALINK row. */
  permalink?: string;
  /** Embed snippet (markdown / iframe / img tag). Caller decides format. */
  embedSnippet?: string;
  /** Pre-built tracking URL (typically permalink + utm params). */
  trackingParams?: string;

  // ── How-it-works footer ───────────────────────────────────────────────
  steps?: SharePanelStep[] | string[];
  /** Eyebrow over the steps. Default "// HOW IT WORKS". */
  stepsEyebrow?: string;

  /** Extra className appended to the outer .panel. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SharePanel({
  title = "Share",
  variant = "default",
  statusLabel,
  statusTone = "live",
  sizes,
  activeSize,
  onSelectSize,
  themes,
  activeTheme,
  onSelectTheme,
  preview,
  primaryCta,
  shareUrl,
  shareText,
  hashtags,
  copyLink = false,
  postOnX = false,
  postOnReddit = false,
  redditSubreddit,
  permalink,
  embedSnippet,
  trackingParams,
  steps,
  stepsEyebrow = "// HOW IT WORKS",
  className,
}: SharePanelProps) {
  const normalizedSteps: SharePanelStep[] | undefined = steps
    ? steps.map((s) => (typeof s === "string" ? { label: s } : s))
    : undefined;

  const hasSecondary = copyLink || postOnX || postOnReddit;
  const hasUrlFields = Boolean(permalink || embedSnippet || trackingParams);

  const absoluteShareUrl = shareUrl ? absoluteUrl(shareUrl) : undefined;
  const xIntentUrl =
    postOnX && absoluteShareUrl
      ? buildShareToXUrl({
          text: shareText ?? "",
          url: absoluteShareUrl,
          via: ["TrendingRepo"],
          hashtags,
        })
      : undefined;
  const redditIntentUrl =
    postOnReddit && absoluteShareUrl
      ? buildRedditIntentUrl({
          url: absoluteShareUrl,
          title: shareText,
          subreddit: redditSubreddit,
        })
      : undefined;

  async function copy(text: string, success: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error("Could not copy — clipboard blocked");
    }
  }

  const headEyebrow = variant === "ranking" ? title : `// ${title.toUpperCase()}`;

  return (
    <aside
      className={
        "panel share-panel" +
        (variant === "ranking" ? " share-panel--ranking" : "") +
        (className ? ` ${className}` : "")
      }
      aria-label={title}
    >
      <header className="panel-head share-panel-head">
        <span className="share-panel-title">{headEyebrow}</span>
        {statusLabel ? (
          <span className={`share-status share-status--${statusTone}`}>
            <span className={`live-dot ${statusTone}`} aria-hidden="true" />
            <span>{statusLabel}</span>
          </span>
        ) : null}
      </header>

      <div className="panel-body share-panel-body">
        {sizes && sizes.length > 0 ? (
          <section className="share-section">
            <div className="share-section-label">Size</div>
            <div className="size-grid" role="group" aria-label="Export size">
              {sizes.map((s) => {
                const active = s.id === activeSize;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`size-chip${active ? " on" : ""}`}
                    aria-pressed={active}
                    onClick={() => onSelectSize?.(s.id)}
                  >
                    <span className="size-chip-label">{s.label}</span>
                    <span className="size-chip-dim">
                      {s.w}×{s.h}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {themes && themes.length > 0 ? (
          <section className="share-section">
            <div className="share-section-label">Theme</div>
            <div className="theme-grid" role="group" aria-label="Card theme">
              {themes.map((t) => {
                const active = t.id === activeTheme;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`theme-chip${active ? " on" : ""}`}
                    aria-pressed={active}
                    onClick={() => onSelectTheme?.(t.id)}
                  >
                    <span
                      className="theme-swatch"
                      aria-hidden="true"
                      style={{
                        background: t.swatch[0],
                        boxShadow: `inset -10px 0 0 0 ${t.swatch[1]}`,
                      }}
                    />
                    <span className="theme-chip-label">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {preview ? (
          <section className="share-section share-preview-wrap">
            <div className="share-section-label">Preview</div>
            <div className="share-preview">{preview}</div>
          </section>
        ) : null}

        {primaryCta ? (
          <section className="share-section">
            <PrimaryCtaButton cta={primaryCta} variant={variant} />
          </section>
        ) : null}

        {hasSecondary ? (
          <section className="share-section share-secondary-row">
            {copyLink && absoluteShareUrl ? (
              <button
                type="button"
                className="share-action share-action--copy"
                onClick={() => void copy(absoluteShareUrl, "Link copied to clipboard")}
                aria-label="Copy link"
              >
                <Icon name="link" size="sm" />
                <span>Copy link</span>
              </button>
            ) : null}
            {xIntentUrl ? (
              <a
                href={xIntentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="share-action share-action--x"
                aria-label="Post on X"
              >
                <SourceLogo source="x-twitter" size="sm" />
                <span>Post on X</span>
              </a>
            ) : null}
            {redditIntentUrl ? (
              <a
                href={redditIntentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="share-action share-action--reddit"
                aria-label="Post on Reddit"
              >
                <SourceLogo source="reddit" size="sm" />
                <span>Post on Reddit</span>
              </a>
            ) : null}
          </section>
        ) : null}

        {hasUrlFields ? (
          <section className="share-section share-url-fields">
            {permalink ? (
              <UrlField
                label="PERMALINK"
                value={permalink}
                onCopy={(v) => void copy(v, "Permalink copied")}
              />
            ) : null}
            {embedSnippet ? (
              <UrlField
                label="EMBED"
                value={embedSnippet}
                onCopy={(v) => void copy(v, "Embed snippet copied")}
                multiline
              />
            ) : null}
            {trackingParams ? (
              <UrlField
                label="TRACKING"
                value={trackingParams}
                onCopy={(v) => void copy(v, "Tracking URL copied")}
              />
            ) : null}
          </section>
        ) : null}
      </div>

      {normalizedSteps && normalizedSteps.length > 0 ? (
        <footer className="share-panel-footer">
          <div className="share-footer-eyebrow">{stepsEyebrow}</div>
          <ol className="steps-list">
            {normalizedSteps.map((step, i) => (
              <li className="steps-item" key={`${i}-${step.label}`}>
                <span className="steps-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="steps-body">
                  <span className="steps-label">{step.label}</span>
                  {step.hint ? <span className="steps-hint">{step.hint}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </footer>
      ) : null}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PrimaryCtaButton({
  cta,
  variant,
}: {
  cta: SharePanelCta;
  variant: "default" | "ranking";
}) {
  const iconName = cta.icon ?? "download";
  const content = (
    <>
      <Icon name={iconName} size="md" />
      <span>{cta.label}</span>
      {variant === "ranking" ? null : (
        <span className="share-cta-arrow" aria-hidden="true">
          →
        </span>
      )}
    </>
  );
  const className = "btn primary lg share-primary-cta";
  if (cta.href) {
    return (
      <a
        href={cta.href}
        download={cta.download}
        className={className}
        aria-disabled={cta.disabled || undefined}
        rel="noopener"
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={cta.onClick}
      disabled={cta.disabled}
    >
      {content}
    </button>
  );
}

function UrlField({
  label,
  value,
  onCopy,
  multiline = false,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className={`url-field${multiline ? " url-field--multiline" : ""}`}>
      <span className="url-field-label">{label}</span>
      <div className="url-field-row">
        {multiline ? (
          <textarea
            className="url-field-input"
            value={value}
            readOnly
            rows={2}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <input
            type="text"
            className="url-field-input"
            value={value}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <button
          type="button"
          className="url-field-copy"
          onClick={() => onCopy(value)}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          <Icon name="copy" size="sm" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RedditIntentInput {
  url: string;
  title?: string;
  subreddit?: string;
}

function buildRedditIntentUrl({ url, title, subreddit }: RedditIntentInput): string {
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit`
    : "https://www.reddit.com/submit";
  const params = new URLSearchParams();
  params.set("url", url);
  if (title) params.set("title", title);
  return `${base}?${params.toString()}`;
}

export default SharePanel;
