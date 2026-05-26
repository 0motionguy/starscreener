"use client";

// TrendingRepo — Star Activity ShareBar.
//
// Compact action row that turns a /compare or /repo/.../star-activity view
// into a shareable artifact. Six actions:
//   1. Download PNG  — direct download of the OG card
//   2. Download SVG  — vector variant for blog/README embeds
//   3. Copy CSV      — raw (date, stars[, ...]) to clipboard
//   4. Copy Link     — current page URL with state encoded
//   5. Share on X    — twitter.com/intent/tweet pre-filled
//   6. Copy Embed    — three snippet variants (markdown / <img> / iframe)
//
// All copy actions go through navigator.clipboard with a sonner toast
// confirmation so the user gets visual feedback even when nothing on the
// page changes.

import { useState } from "react";
import { Icon } from "@/lib/icons";

import {
  buildAbsoluteShareImageUrl,
  buildCsv,
  buildShareImageUrl,
  type CsvSeries,
  type StarActivityImageState,
  type StarActivityState,
} from "@/lib/star-activity-url";
import { absoluteUrl } from "@/lib/seo";
import { toast } from "@/lib/toast";
import { buildShareToXUrl } from "@/lib/twitter/outbound/share";
import { cn } from "@/lib/utils";

interface ShareBarProps {
  /**
   * Star-activity state. Optional — surfaces that don't have a chart pass
   * nothing. When omitted, internals default to an empty repos list.
   */
  state?: StarActivityState;
  /**
   * Absolute or relative path of the page being shared. Used as the URL
   * pasted into the X intent dialog and copied to clipboard. REQUIRED for
   * non-star-activity surfaces; defaults to `/compare?...state...` when
   * `state` is provided.
   */
  pagePath?: string;
  /**
   * Tweet text override. When omitted, defaults to the star-activity
   * "Star activity of A vs B — via @TrendingRepo" string. Surfaces with
   * their own narrative (top-10, tier-list) pass their text here.
   */
  shareText?: string;
  /** Optional hashtags appended to the X intent. */
  hashtags?: string[];
  /**
   * Per-repo points for the CSV download. When omitted the CSV button is
   * still rendered but emits an empty header — caller should pass actual
   * data once the chart has loaded.
   */
  csvSeries?: CsvSeries[];
  /**
   * Override the share-image endpoint. Defaults to `/api/og/star-activity`
   * (the original consumer). Surfaces with their own card endpoint pass
   * their endpoint here so PNG / SVG download + og:image hit the right
   * renderer.
   */
  imageEndpoint?: string;
  /** Hide the CSV button on surfaces that don't have row-by-row data. */
  hideCsv?: boolean;
  /** Compact = no labels, icon-only buttons. Used in tight inline rows. */
  compact?: boolean;
  /** Visual variant. `"mega"` enlarges the buttons and tints the label text
   *  with --accent (brand orange). Used on hero-y share strips like
   *  `/tools/star-history`'s "Grab the chart" section. */
  variant?: "default" | "mega";
  className?: string;
}

const EMPTY_STATE: StarActivityState = {
  repos: [],
  mode: "date",
  scale: "lin",
  legend: "tr",
};

const BUTTON_BASE = "tr-share-btn";

export function ShareBar({
  state,
  pagePath,
  shareText,
  hashtags,
  csvSeries,
  imageEndpoint,
  hideCsv = false,
  compact = false,
  variant = "default",
  className,
}: ShareBarProps) {
  const [openEmbed, setOpenEmbed] = useState(false);

  const effectiveState = state ?? EMPTY_STATE;
  const resolvedPagePath = pagePath ?? buildPagePath(effectiveState);
  const absolutePageUrl = absoluteUrl(resolvedPagePath);

  const horizontalImage: StarActivityImageState = {
    ...effectiveState,
    aspect: "h",
  };
  // Default endpoint is the star-activity card; surfaces with their own
  // renderer override via the imageEndpoint prop. The state is still
  // passed through as querystring — the server can read what it needs and
  // ignore the rest, so this stays generic.
  const buildEndpointUrl = (
    opts: { format?: "png" | "svg"; download?: boolean } = {},
  ) => {
    if (!imageEndpoint) {
      return buildShareImageUrl(horizontalImage, opts);
    }
    const params = new URLSearchParams();
    if (effectiveState.repos.length > 0) params.set("repos", effectiveState.repos.join(","));
    if (effectiveState.mode !== "date") params.set("mode", effectiveState.mode);
    if (effectiveState.scale !== "lin") params.set("scale", effectiveState.scale);
    if (horizontalImage.aspect && horizontalImage.aspect !== "h") {
      params.set("aspect", horizontalImage.aspect);
    }
    if (opts.format && opts.format !== "png") params.set("format", opts.format);
    if (opts.download) params.set("download", "1");
    const qs = params.toString();
    return qs ? `${imageEndpoint}?${qs}` : imageEndpoint;
  };
  const pngUrl = buildEndpointUrl();
  const svgUrl = buildEndpointUrl({ format: "svg", download: true });
  const absoluteImageUrl = imageEndpoint
    ? absoluteUrl(buildEndpointUrl())
    : buildAbsoluteShareImageUrl(horizontalImage);
  const intentUrl = buildShareToXUrl({
    text: shareText ?? tweetText(effectiveState),
    url: absolutePageUrl,
    via: ["TrendingRepo"],
    hashtags,
  });

  function tweetText(s: StarActivityState): string {
    const list = s.repos.join(" vs ") || "open source";
    return `Star activity of ${list} — via @TrendingRepo`;
  }

  async function copyToClipboard(text: string, successLabel: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successLabel);
    } catch {
      toast.error("Could not copy — clipboard blocked");
    }
  }

  const padding = compact
    ? "px-2 py-1 text-[10px]"
    : variant === "mega"
      ? "px-4 py-2.5 text-[13px] gap-2 tr-share-btn--mega"
      : "px-2.5 py-1.5 text-[11px]";
  const rowGap = variant === "mega" ? "gap-2.5" : "gap-1.5";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("flex flex-wrap items-center", rowGap)}>
        <a
          href={pngUrl}
          download={`star-activity-${todayStamp()}.png`}
          className={cn(BUTTON_BASE, padding)}
          aria-label="Download PNG"
        >
          <Icon name="download" size="sm" />
          {!compact && <span>PNG</span>}
        </a>

        <a
          href={svgUrl}
          download={`star-activity-${todayStamp()}.svg`}
          className={cn(BUTTON_BASE, padding)}
          aria-label="Download SVG"
        >
          <Icon name="download" size="sm" />
          {!compact && <span>SVG</span>}
        </a>

        {!hideCsv && (
          <button
            type="button"
            onClick={() => {
              const csv = buildCsv(csvSeries ?? []);
              void copyToClipboard(csv, "CSV copied to clipboard");
            }}
            className={cn(BUTTON_BASE, padding)}
            aria-label="Copy CSV"
          >
            <Icon name="file-text" size="sm" />
            {!compact && <span>CSV</span>}
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            void copyToClipboard(absolutePageUrl, "Link copied to clipboard")
          }
          className={cn(BUTTON_BASE, padding)}
          aria-label="Copy link"
        >
          <Icon name="link" size="sm" />
          {!compact && <span>Link</span>}
        </button>

        <a
          href={intentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(BUTTON_BASE, padding)}
          aria-label="Share on X"
        >
          <Icon name="share" size="sm" />
          {!compact && <span>Share on X</span>}
        </a>

        <button
          type="button"
          onClick={() => setOpenEmbed((v) => !v)}
          className={cn(BUTTON_BASE, padding)}
          aria-expanded={openEmbed}
          aria-controls="share-bar-embed"
        >
          <Icon name="code" size="sm" />
          {!compact && <span>Embed</span>}
        </button>
      </div>

      {openEmbed && (
        <EmbedPanel
          id="share-bar-embed"
          imageUrl={absoluteImageUrl}
          pageUrl={absolutePageUrl}
          onCopy={copyToClipboard}
        />
      )}
    </div>
  );
}

interface EmbedPanelProps {
  id: string;
  imageUrl: string;
  pageUrl: string;
  onCopy: (text: string, label: string) => Promise<void>;
}

function EmbedPanel({ id, imageUrl, pageUrl, onCopy }: EmbedPanelProps) {
  const markdown = `![Star activity](${imageUrl})`;
  const htmlTag = `<img src="${imageUrl}" alt="Star activity" />`;
  // Append embed=1 with the right separator — pageUrl may already carry ?repos=...
  const sep = pageUrl.includes("?") ? "&" : "?";
  const iframe = `<iframe src="${pageUrl}${sep}embed=1" width="100%" height="400" style="border:0"></iframe>`;
  return (
    <div
      id={id}
      className="tr-embed-panel"
      style={{
        borderRadius: "3px",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface)",
        padding: "10px 12px",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
      }}
    >
      <EmbedRow label="MD" value={markdown} onCopy={onCopy} />
      <EmbedRow label="IMG" value={htmlTag} onCopy={onCopy} />
      <EmbedRow label="IFRAME" value={iframe} onCopy={onCopy} />
    </div>
  );
}

interface EmbedRowProps {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => Promise<void>;
}

function EmbedRow({ label, value, onCopy }: EmbedRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "6px 0",
      }}
    >
      <span
        style={{
          width: "60px",
          flexShrink: 0,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--fg-subtle)",
          fontSize: "9.5px",
          paddingTop: "2px",
        }}
      >
        {label}
      </span>
      <code
        style={{
          flex: 1,
          wordBreak: "break-all",
          color: "var(--fg-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "10.5px",
          lineHeight: 1.5,
        }}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={() => void onCopy(value, `${label} snippet copied`)}
        className="tr-embed-copy"
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "3px",
          border: "1px solid var(--border-subtle)",
          background: "var(--surface-3)",
          padding: "4px 6px",
          color: "var(--fg-muted)",
          cursor: "pointer",
        }}
        aria-label={`Copy ${label} snippet`}
      >
        <Icon name="copy" size={11} />
      </button>
    </div>
  );
}

function buildPagePath(state: StarActivityState): string {
  // Single repo => /repo/<owner>/<name>/star-activity, multi => /compare.
  if (state.repos.length === 1) {
    const [owner, name] = state.repos[0].split("/");
    if (owner && name) return `/repo/${owner}/${name}/star-activity`;
  }
  const params = new URLSearchParams();
  if (state.repos.length > 0) params.set("repos", state.repos.join(","));
  if (state.mode !== "date") params.set("mode", state.mode);
  if (state.scale !== "lin") params.set("scale", state.scale);
  if (state.legend !== "tr") params.set("legend", state.legend);
  const qs = params.toString();
  return qs ? `/compare?${qs}` : "/compare";
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
