"use client";

import { useMemo } from "react";
import Image from "next/image";

import {
  ShareExportPanel,
  ShareFormatButton,
  ShareFormatGrid,
  ShareMetaBlock,
  ShareMetaRow,
} from "@/components/ui/ShareExport";
import { absoluteUrl } from "@/lib/seo";
import { toast } from "@/lib/toast";
import {
  TOP10_THEMES,
  type Top10Category,
  type Top10Theme,
  type Top10Window,
} from "@/lib/top10/types";
import { buildShareToXUrl } from "@/lib/twitter/outbound/share";

export type ShareAspect = "h" | "sq" | "v" | "yt";

const ASPECT_LABEL: Record<ShareAspect, { label: string; px: string }> = {
  h: { label: "X / TW", px: "1200×675" },
  sq: { label: "SQUARE", px: "1080×1080" },
  v: { label: "IG STORY", px: "1080×1350" },
  yt: { label: "YT", px: "1280×720" },
};

const THEME_LABEL: Record<Top10Theme, { label: string; swatch: string }> = {
  dark: { label: "DARK", swatch: "#08090a" },
  light: { label: "LIGHT", swatch: "#fafaf7" },
  mono: { label: "MONO", swatch: "#1a1a1a" },
};

interface ShareSurfaceProps {
  category: Top10Category;
  window: Top10Window;
  aspect: ShareAspect;
  theme: Top10Theme;
  onAspect: (a: ShareAspect) => void;
  onTheme: (t: Top10Theme) => void;
}

export function ShareSurface({
  category,
  window,
  aspect,
  theme,
  onAspect,
  onTheme,
}: ShareSurfaceProps) {
  const pagePath = useMemo(
    () => buildPagePath(category, window, theme),
    [category, window, theme],
  );
  const absPageUrl = absoluteUrl(pagePath);
  const utmPageUrl = withUtm(absPageUrl, category);

  const ogParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("cat", category);
    p.set("window", window);
    p.set("aspect", aspect);
    if (theme !== "dark") p.set("theme", theme);
    return p.toString();
  }, [category, window, aspect, theme]);

  const svgUrl = `/api/og/top10?${ogParams}&format=svg`;
  const pngUrl = `/api/og/top10?${ogParams}`;
  const absImageUrl = absoluteUrl(pngUrl);

  const intentUrl = buildShareToXUrl({
    text: tweetText(category, window),
    url: utmPageUrl,
    via: ["TrendingRepo"],
  });

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy - clipboard blocked");
    }
  }

  return (
    <aside
      className="flex flex-col gap-3 share-stack"
      style={{ position: "sticky", top: 14 }}
    >
      <ShareExportPanel>
        <div
          className="v2-mono flex items-center gap-2 px-3 py-2"
          style={{
            borderBottom: "1px solid var(--v3-line-200, #29323b)",
            fontSize: 10,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            color: "var(--v3-ink-300, #84909b)",
            background:
              "linear-gradient(180deg, var(--v3-bg-050, #101418), var(--v3-bg-025, #0b0d0f))",
          }}
        >
          <CornerDots />
          <span style={{ color: "var(--v3-ink-100, #eef0f2)", fontWeight: 600 }}>
            {"// SHARE"}
          </span>
          <span
            style={{
              marginLeft: "auto",
              color: "var(--v3-sig-green, #22c55e)",
            }}
          >
            PNG - BRANDED
          </span>
        </div>

        <FormatPicker aspect={aspect} onAspect={onAspect} />

        <ThemePicker theme={theme} onTheme={onTheme} />

        <CardPreview
          svgUrl={svgUrl}
          aspect={aspect}
          category={category}
          theme={theme}
        />

        <ShareActions
          pngUrl={pngUrl}
          intentUrl={intentUrl}
          shareUrl={utmPageUrl}
          aspect={aspect}
          category={category}
          theme={theme}
          onCopy={copy}
        />

        <ShareMeta
          permalink={utmPageUrl}
          embedSrc={`<iframe src="${absImageUrl}" width="100%" height="${aspect === "v" ? 600 : 400}" style="border:0"></iframe>`}
        />
      </ShareExportPanel>
      <style>{`
        @media (max-width: 1023px) {
          .share-stack { position: relative !important; top: 0 !important; }
        }
      `}</style>
    </aside>
  );
}

function CornerDots() {
  return (
    <span className="flex gap-[3px] mr-1">
      <i
        style={{
          width: 4,
          height: 4,
          background: "var(--v2-acc, #f56e0f)",
          display: "block",
        }}
      />
      <i
        style={{
          width: 4,
          height: 4,
          background: "var(--v3-sig-green, #22c55e)",
          display: "block",
        }}
      />
      <i
        style={{
          width: 4,
          height: 4,
          background: "var(--v3-ink-300, #84909b)",
          display: "block",
        }}
      />
    </span>
  );
}

function ThemePicker({
  theme,
  onTheme,
}: {
  theme: Top10Theme;
  onTheme: (t: Top10Theme) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto repeat(3, 1fr)",
        gap: 4,
        padding: "0 10px 10px 10px",
        alignItems: "center",
      }}
    >
      <span
        className="v2-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--v3-ink-400, #909caa)",
          textTransform: "uppercase",
          paddingRight: 8,
        }}
      >
        THEME
      </span>
      {TOP10_THEMES.map((t) => {
        const meta = THEME_LABEL[t];
        const on = t === theme;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onTheme(t)}
            className="v2-mono"
            style={{
              height: 32,
              border: on
                ? "1px solid var(--v2-acc, #f56e0f)"
                : "1px solid var(--v3-line-300, #3a444f)",
              background: on
                ? "var(--v2-acc-soft, rgba(245,110,15,0.14))"
                : "var(--v3-bg-050, #101418)",
              color: on ? "var(--v2-acc, #f56e0f)" : "var(--v3-ink-300, #84909b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontWeight: on ? 700 : 400,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: meta.swatch,
                border: "1px solid rgba(255,255,255,0.15)",
                display: "block",
              }}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function FormatPicker({
  aspect,
  onAspect,
}: {
  aspect: ShareAspect;
  onAspect: (a: ShareAspect) => void;
}) {
  return (
    <ShareFormatGrid>
      {(["h", "sq", "v", "yt"] as ShareAspect[]).map((a) => {
        const t = ASPECT_LABEL[a];
        const on = a === aspect;
        return (
          <ShareFormatButton
            key={a}
            onClick={() => onAspect(a)}
            active={on}
            label={t.label}
            size={t.px}
          />
        );
      })}
    </ShareFormatGrid>
  );
}

function CardPreview({
  svgUrl,
  aspect,
  category,
  theme,
}: {
  svgUrl: string;
  aspect: ShareAspect;
  category: Top10Category;
  theme: Top10Theme;
}) {
  const ratio: Record<ShareAspect, string> = {
    h: "1200/675",
    sq: "1/1",
    v: "1080/1350",
    yt: "1280/720",
  };
  const frameBg =
    theme === "light" ? "#fafaf7" : theme === "mono" ? "#000" : "#0a0b0d";
  return (
    <div className="card-preview">
      <div
        style={{
          width: "100%",
          aspectRatio: ratio[aspect],
          background: frameBg,
          border: "1px solid var(--v3-line-300, #3a444f)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Image
          key={`${category}-${aspect}-${theme}`}
          src={svgUrl}
          alt={`Top 10 ${category} - ${aspect} ${theme} preview`}
          fill
          unoptimized
          style={{
            display: "block",
            objectFit: "cover",
          }}
        />
      </div>
    </div>
  );
}

function ShareActions({
  pngUrl,
  shareUrl,
  intentUrl,
  aspect,
  category,
  theme,
  onCopy,
}: {
  pngUrl: string;
  shareUrl: string;
  intentUrl: string;
  aspect: ShareAspect;
  category: Top10Category;
  theme: Top10Theme;
  onCopy: (text: string, label: string) => Promise<void>;
}) {
  const themeSuffix = theme === "dark" ? "" : `-${theme}`;
  const filename = `top10-${category}-${aspect}${themeSuffix}-${todayStamp()}.png`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        padding: 10,
        borderTop: "1px solid var(--v3-line-200, #29323b)",
      }}
    >
      <a
        href={pngUrl}
        download={filename}
        className="v2-mono"
        style={{
          gridColumn: "1 / -1",
          height: 36,
          border: "1px solid var(--v2-acc, #f56e0f)",
          background: "var(--v2-acc, #f56e0f)",
          color: "#1a0a04",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        DOWNLOAD PNG - {ASPECT_LABEL[aspect].px}
      </a>
      <button
        type="button"
        onClick={() => void onCopy(shareUrl, "Link copied to clipboard")}
        className="v2-mono"
        style={{
          height: 34,
          border: "1px solid var(--v3-line-300, #3a444f)",
          background: "var(--v3-bg-050, #101418)",
          color: "var(--v3-ink-100, #eef0f2)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        COPY LINK
      </button>
      <a
        href={intentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="v2-mono"
        style={{
          height: 34,
          border: "1px solid var(--v3-line-300, #3a444f)",
          background: "var(--v3-bg-050, #101418)",
          color: "var(--v3-ink-100, #eef0f2)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
        }}
      >
        POST
      </a>
    </div>
  );
}

function ShareMeta({
  permalink,
  embedSrc,
}: {
  permalink: string;
  embedSrc: string;
}) {
  return (
    <ShareMetaBlock>
      <MetaRow label="PERMALINK" value={permalink} />
      <MetaRow label="EMBED" value={embedSrc} />
      <MetaRow
        label="UTM"
        value="?utm_source=top10&utm_medium=share"
        readOnly
      />
    </ShareMetaBlock>
  );
}

function MetaRow({
  label,
  value,
  readOnly,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
}) {
  return (
    <ShareMetaRow label={label}>
      {readOnly ? (
        <span style={{ color: "var(--v3-ink-200, #b8c0c8)" }}>{value}</span>
      ) : (
        <input
          value={value}
          readOnly
          style={{
            flex: 1,
            background: "var(--v3-bg-050, #101418)",
            border: "1px solid var(--v3-line-300, #3a444f)",
            color: "var(--v3-ink-100, #eef0f2)",
            padding: "5px 8px",
            fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
            fontSize: 10,
          }}
        />
      )}
    </ShareMetaRow>
  );
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function buildPagePath(
  category: Top10Category,
  window: Top10Window,
  theme: Top10Theme,
): string {
  const params = new URLSearchParams();
  if (category !== "repos") params.set("cat", category);
  if (window !== "30d") params.set("w", window);
  if (theme !== "dark") params.set("theme", theme);
  const qs = params.toString();
  return qs ? `/top10?${qs}` : "/top10";
}

function tweetText(category: Top10Category, window: Top10Window): string {
  const categoryLabel = category.toUpperCase();
  const windowLabel = window.toUpperCase();
  return `Top 10 ${categoryLabel} - ${windowLabel} snapshot from TrendingRepo`;
}

function withUtm(absUrl: string, category: Top10Category): string {
  const url = new URL(absUrl);
  url.searchParams.set("utm_source", "top10");
  url.searchParams.set("utm_medium", "share");
  url.searchParams.set("utm_campaign", `top10-${category}`);
  return url.toString();
}


