"use client";

// /compare right-rail share panel (W3.I).
//
// Mirrors the design mock — PNG presets (square/X/IG/YT), shareable link
// via /s/{shortId} (W3.J), embed iframe snippet, and a HOW IT WORKS strip.
// Reuses the OG endpoint built in W3.H+K with all chart state passed
// through as querystring (theme/metric/window/mode/scale/watermark).

import { useState } from "react";
import {
  Code,
  Copy,
  Download,
  Link as LinkIcon,
  Loader2,
  Share2,
} from "lucide-react";

import type {
  StarActivityMetric,
  StarActivityMode,
  StarActivityScale,
  StarActivityWindow,
} from "@/lib/star-activity";
import type { ChartTheme } from "./themes";
import { absoluteUrl } from "@/lib/seo";
import { toast } from "@/lib/toast";
import { buildShareToXUrl } from "@/lib/twitter/outbound/share";
import { cn } from "@/lib/utils";

export interface CompareSharePanelState {
  repos: string[];
  metric: StarActivityMetric;
  window: StarActivityWindow;
  mode: StarActivityMode;
  scale: StarActivityScale;
  theme: ChartTheme;
}

interface CompareSharePanelProps {
  state: CompareSharePanelState;
  className?: string;
}

interface AspectPreset {
  key: "h" | "v" | "yt";
  label: string;
  size: string;
  watermarked: boolean;
}

const ASPECT_PRESETS: ReadonlyArray<AspectPreset> = [
  { key: "h", label: "PNG · X / Twitter", size: "1200 × 675", watermarked: false },
  { key: "v", label: "PNG · Instagram", size: "1080 × 1350", watermarked: false },
  { key: "yt", label: "PNG · YouTube", size: "1280 × 720", watermarked: false },
];

/** Build the OG endpoint URL for a given aspect, optionally watermarked. */
function buildOgUrl(
  state: CompareSharePanelState,
  aspect: "h" | "v" | "yt",
  opts: { watermark?: boolean; format?: "png" | "svg"; download?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (state.repos.length > 0) params.set("repos", state.repos.join(","));
  if (state.metric !== "stars") params.set("metric", state.metric);
  if (state.window !== "all") params.set("window", state.window);
  if (state.mode !== "date") params.set("mode", state.mode);
  if (state.scale !== "lin") params.set("scale", state.scale);
  if (state.theme !== "terminal") params.set("theme", state.theme);
  if (aspect !== "h") params.set("aspect", aspect);
  if (opts.format && opts.format !== "png") params.set("format", opts.format);
  if (opts.download) params.set("download", "1");
  // watermark default ON in OG endpoint; only set explicit ?watermark=0
  // when the caller wants the bare variant.
  if (opts.watermark === false) params.set("watermark", "0");
  return `/api/og/star-activity?${params.toString()}`;
}

function buildPagePath(state: CompareSharePanelState): string {
  const params = new URLSearchParams();
  if (state.repos.length > 0) params.set("repos", state.repos.join(","));
  if (state.metric !== "stars") params.set("metric", state.metric);
  if (state.window !== "all") params.set("window", state.window);
  if (state.mode !== "date") params.set("mode", state.mode);
  if (state.scale !== "lin") params.set("scale", state.scale);
  if (state.theme !== "terminal") params.set("theme", state.theme);
  const qs = params.toString();
  return qs ? `/compare?${qs}` : "/compare";
}

const TAB_BUTTON_BASE =
  "px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] transition-colors";
const ROW_BASE =
  "flex items-center justify-between gap-3 px-3 py-2.5 rounded-[3px] border border-border-primary bg-bg-secondary hover:bg-bg-tertiary transition-colors";
const ICON_BUTTON_BASE =
  "shrink-0 inline-flex items-center justify-center rounded-[3px] border border-border-primary bg-bg-tertiary p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-card";

export function CompareSharePanel({
  state,
  className,
}: CompareSharePanelProps) {
  const [tab, setTab] = useState<"png" | "embed">("png");
  const [shortlink, setShortlink] = useState<string | null>(null);
  const [shortlinkLoading, setShortlinkLoading] = useState(false);

  const pageUrl = absoluteUrl(buildPagePath(state));

  async function copyToClipboard(text: string, successLabel: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successLabel);
    } catch {
      toast.error("Could not copy — clipboard blocked");
    }
  }

  async function saveAndShare() {
    if (state.repos.length === 0) {
      toast.error("Add at least one repo first");
      return;
    }
    setShortlinkLoading(true);
    try {
      const res = await fetch("/api/compare/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        throw new Error(json?.error ?? "save_failed");
      }
      setShortlink(json.url as string);
      void copyToClipboard(json.url as string, "Shareable link copied");
    } catch (err) {
      toast.error(
        err instanceof Error ? `Save failed: ${err.message}` : "Save failed",
      );
    } finally {
      setShortlinkLoading(false);
    }
  }

  const intentText = state.repos.length
    ? `Star activity of ${state.repos.join(" vs ")} — via @TrendingRepo`
    : "Star activity — via @TrendingRepo";
  const intentUrl = buildShareToXUrl({
    text: intentText,
    url: shortlink ?? pageUrl,
    via: ["TrendingRepo"],
  });

  // Watermarked square preset = the X auto-unfurl card with watermark on.
  const watermarkedSquareUrl = buildOgUrl(state, "h", { watermark: true });

  const embedImg = `<img src="${absoluteUrl(buildOgUrl(state, "h"))}" alt="Star activity" />`;
  const embedMd = `![Star activity](${absoluteUrl(buildOgUrl(state, "h"))})`;
  const embedIframe = `<iframe src="${pageUrl}&embed=1" width="600" height="340" style="border:0"></iframe>`;

  return (
    <aside
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border-primary bg-bg-secondary p-4 w-full max-w-sm",
        className,
      )}
      aria-label="Share panel"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {"// SHARE"}
        </span>
        <div className="inline-flex gap-px rounded-[3px] border border-border-primary overflow-hidden">
          <button
            type="button"
            onClick={() => setTab("png")}
            className={cn(
              TAB_BUTTON_BASE,
              tab === "png"
                ? "bg-bg-tertiary text-text-primary"
                : "bg-bg-secondary text-text-tertiary hover:text-text-secondary",
            )}
            aria-pressed={tab === "png"}
          >
            PNG
          </button>
          <button
            type="button"
            onClick={() => setTab("embed")}
            className={cn(
              TAB_BUTTON_BASE,
              tab === "embed"
                ? "bg-bg-tertiary text-text-primary"
                : "bg-bg-secondary text-text-tertiary hover:text-text-secondary",
            )}
            aria-pressed={tab === "embed"}
          >
            EMBED
          </button>
        </div>
      </div>

      {tab === "png" ? (
        <>
          {/* SAVE & SHARE — primary action: POSTs current state, returns
              shortId, copies the resulting /s/{shortId} URL. */}
          <button
            type="button"
            onClick={saveAndShare}
            disabled={shortlinkLoading || state.repos.length === 0}
            className={cn(
              ROW_BASE,
              "border-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Save and share — copies a short link and the watermarked PNG"
          >
            <div className="flex items-center gap-3 min-w-0">
              {shortlinkLoading ? (
                <Loader2 size={16} className="animate-spin text-brand" />
              ) : (
                <Share2 size={16} className="text-brand" />
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-primary text-left">
                  Save & Share
                </span>
                <span className="text-[10px] font-mono text-text-tertiary text-left">
                  PNG · 1200×675 · WATERMARKED
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-text-tertiary">↗</span>
          </button>

          {/* Bare aspect downloads — direct anchors with `download` attr */}
          {ASPECT_PRESETS.map((preset) => (
            <a
              key={preset.key}
              href={buildOgUrl(state, preset.key)}
              download={`compare-${preset.key}-${todayStamp()}.png`}
              className={ROW_BASE}
              aria-label={`Download ${preset.label}`}
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-secondary">
                  {preset.label}
                </span>
                <span className="text-[10px] font-mono text-text-tertiary">
                  {preset.size}
                </span>
              </div>
              <Download size={14} className="text-text-tertiary shrink-0" />
            </a>
          ))}

          {/* SHAREABLE LINK row — populated after Save & Share fires */}
          <div className={ROW_BASE}>
            <div className="flex items-center gap-3 min-w-0">
              <LinkIcon size={14} className="text-text-tertiary shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
                  Shareable Link
                </span>
                <span className="text-[11px] font-mono text-text-secondary truncate">
                  {shortlink ?? "Click Save & Share"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (shortlink) {
                  void copyToClipboard(shortlink, "Link copied");
                } else {
                  void saveAndShare();
                }
              }}
              className={ICON_BUTTON_BASE}
              aria-label="Copy shareable link"
            >
              <Copy size={11} aria-hidden />
            </button>
          </div>

          {/* Direct Share-on-X intent button. Falls back to /compare URL if
              shortlink not yet generated. */}
          <a
            href={intentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={ROW_BASE}
            aria-label="Share on X"
          >
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-secondary">
              Share on X
            </span>
            <Share2 size={14} className="text-text-tertiary shrink-0" />
          </a>

          {/* Just-look-at-it preview link — opens the watermarked PNG in a
              new tab so the user can sanity-check before sharing. */}
          <a
            href={watermarkedSquareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary hover:text-text-primary px-3 py-1 self-end"
          >
            Preview ↗
          </a>
        </>
      ) : (
        <>
          <EmbedRow label="Markdown" value={embedMd} onCopy={copyToClipboard} />
          <EmbedRow label="HTML img" value={embedImg} onCopy={copyToClipboard} />
          <EmbedRow
            label="Iframe · 600×340"
            value={embedIframe}
            onCopy={copyToClipboard}
          />
        </>
      )}

      <div className="border-t border-border-primary pt-3 mt-1">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {"// HOW IT WORKS"}
        </span>
        <ol className="mt-2 space-y-1 text-[11px] font-mono text-text-secondary">
          <li>1. Pick repos to compare.</li>
          <li>2. Tweak metric · window · theme.</li>
          <li>3. Hit Save & Share — branded PNG drops to clipboard as a /s/ link.</li>
          <li>4. Or copy a download · embed snippet.</li>
        </ol>
      </div>
    </aside>
  );
}

interface EmbedRowProps {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => Promise<void>;
}

function EmbedRow({ label, value, onCopy }: EmbedRowProps) {
  return (
    <div className="rounded-[3px] border border-border-primary bg-bg-tertiary p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
          {label}
        </span>
        <button
          type="button"
          onClick={() => void onCopy(value, `${label} snippet copied`)}
          className={ICON_BUTTON_BASE}
          aria-label={`Copy ${label}`}
        >
          <Copy size={11} aria-hidden />
        </button>
      </div>
      <code className="text-[10px] font-mono text-text-secondary break-all">
        {value}
      </code>
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary inline-flex items-center gap-1.5">
        <Code size={10} aria-hidden />
        embed
      </span>
    </div>
  );
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
