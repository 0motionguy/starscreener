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
import {
  Code,
  Copy,
  Download,
  FileSpreadsheet,
  Link as LinkIcon,
  Share2,
} from "lucide-react";

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
import { BlueskyIcon } from "@/components/brand/BrandIcons";
import { cn } from "@/lib/utils";

// Inline LinkedIn SVG — lucide-react doesn't ship a LinkedIn glyph and the
// project's BrandIcons doesn't have one either. Compact, currentColor-driven
// so it inherits the button text color like every other share button.
function LinkedinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

interface ShareBarProps {
  state: StarActivityState;
  /**
   * Absolute or relative path of the page being shared. Used as the URL
   * pasted into the X intent dialog and copied to clipboard. Defaults to
   * `/compare?...state...`.
   */
  pagePath?: string;
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
  className?: string;
}

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-[3px] border border-border-primary bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary font-mono uppercase tracking-[0.14em] transition-colors";

export function ShareBar({
  state,
  pagePath,
  csvSeries,
  imageEndpoint,
  hideCsv = false,
  compact = false,
  className,
}: ShareBarProps) {
  const [openEmbed, setOpenEmbed] = useState(false);

  const resolvedPagePath =
    pagePath ?? buildPagePath(state);
  const absolutePageUrl = absoluteUrl(resolvedPagePath);

  const horizontalImage: StarActivityImageState = {
    ...state,
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
    if (state.repos.length > 0) params.set("repos", state.repos.join(","));
    if (state.mode !== "date") params.set("mode", state.mode);
    if (state.scale !== "lin") params.set("scale", state.scale);
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
    text: tweetText(state),
    url: absolutePageUrl,
    via: ["TrendingRepo"],
  });
  // LinkedIn share-offsite endpoint takes the URL only — title + summary
  // come from the page's <meta property="og:title"> + og:description so we
  // don't need to encode them client-side. This is the documented modern
  // pattern (shareArticle is deprecated and silently truncates summary).
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(absolutePageUrl)}`;
  // Bluesky compose intent — text + URL are appended as a single string
  // (the bsky.app composer doesn't accept a separate url= param like X).
  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${tweetText(state)} ${absolutePageUrl}`)}`;

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

  const padding = compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={pngUrl}
          download={`star-activity-${todayStamp()}.png`}
          className={cn(BUTTON_BASE, padding)}
          aria-label="Download PNG"
        >
          <Download size={12} aria-hidden />
          {!compact && <span>PNG</span>}
        </a>

        <a
          href={svgUrl}
          download={`star-activity-${todayStamp()}.svg`}
          className={cn(BUTTON_BASE, padding)}
          aria-label="Download SVG"
        >
          <Download size={12} aria-hidden />
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
            <FileSpreadsheet size={12} aria-hidden />
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
          <LinkIcon size={12} aria-hidden />
          {!compact && <span>Link</span>}
        </button>

        <a
          href={intentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(BUTTON_BASE, padding)}
          aria-label="Share on X"
        >
          <Share2 size={12} aria-hidden />
          {!compact && <span>X</span>}
        </a>

        <a
          href={blueskyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(BUTTON_BASE, padding)}
          aria-label="Share on Bluesky"
        >
          <BlueskyIcon size={12} monochrome />
          {!compact && <span>Bluesky</span>}
        </a>

        <a
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(BUTTON_BASE, padding)}
          aria-label="Share on LinkedIn"
        >
          <LinkedinIcon size={12} />
          {!compact && <span>LinkedIn</span>}
        </a>

        <button
          type="button"
          onClick={() => setOpenEmbed((v) => !v)}
          className={cn(BUTTON_BASE, padding)}
          aria-expanded={openEmbed}
          aria-controls="share-bar-embed"
        >
          <Code size={12} aria-hidden />
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
      className="rounded-[3px] border border-border-primary bg-bg-secondary p-3 text-[11px] font-mono"
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
    <div className="flex items-start gap-2 py-1.5 first:pt-0 last:pb-0">
      <span className="w-16 shrink-0 uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </span>
      <code className="flex-1 break-all text-text-secondary">{value}</code>
      <button
        type="button"
        onClick={() => void onCopy(value, `${label} snippet copied`)}
        className="shrink-0 inline-flex items-center justify-center rounded-[3px] border border-border-primary bg-bg-tertiary p-1 text-text-tertiary hover:text-text-primary"
        aria-label={`Copy ${label} snippet`}
      >
        <Copy size={11} aria-hidden />
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
