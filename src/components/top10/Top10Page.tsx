"use client";

// TrendingRepo — /top10 client wrapper.
//
// Renders the full operator-terminal Top 10 surface: category tabs, filter
// chips, ranked rows, share preview panel, mini-list bottom grid.
//
// URL is the source of truth for category/window/aspect/theme/metric — the
// client mirrors `?cat=...&w=...&aspect=...&theme=...&m=...` so a refresh or
// a copied permalink restores the exact view. Window + metric switching for
// repo-derived categories (REPOS / AGENTS / MOVERS) recomputes the bundle
// client-side from a server-shipped 80-row repo slice.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ShareExportPanel,
  ShareFormatButton,
  ShareFormatGrid,
  ShareMetaBlock,
  ShareMetaRow,
} from "@/components/ui/ShareExport";
import {
  buildAgentTop10FromSlice,
  buildMoversTop10FromSlice,
  buildRepoTop10FromSlice,
} from "@/lib/top10/builders";
import {
  CATEGORY_META,
  TOP10_CATEGORIES,
  TOP10_METRICS,
  TOP10_THEMES,
  TOP10_WINDOWS,
  type CategoryMeta,
  type RepoSliceLite,
  type Top10Bundle,
  type Top10Category,
  type Top10Metric,
  type Top10Payload,
  type Top10Theme,
  type Top10Window,
} from "@/lib/top10/types";
import { absoluteUrl } from "@/lib/seo";
import { toast } from "@/lib/toast";
import { buildShareToXUrl } from "@/lib/twitter/outbound/share";

import { CornerDots, RankingPanel, windowLabel } from "./ranking-surface";

interface Top10PageProps {
  payload: Top10Payload;
  categoryMeta: Record<Top10Category, CategoryMeta>;
  /** Server-shipped 80-row slice for client-side window/metric recompute. */
  repoSlice: RepoSliceLite[];
}

type ShareAspect = "h" | "sq" | "v" | "yt";

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

// ---------------------------------------------------------------------------
// URL sync — read once at mount, push back on every state change. Using
// `replace` (not `push`) so the back button doesn't fill with intermediate
// states. searchParams is a snapshot; router.replace handles the URL update
// without re-rendering the server tree.
// ---------------------------------------------------------------------------

const ASPECTS: readonly ShareAspect[] = ["h", "sq", "v", "yt"] as const;

function parseCategoryParam(v: string | null): Top10Category | null {
  return v && (TOP10_CATEGORIES as readonly string[]).includes(v)
    ? (v as Top10Category)
    : null;
}
function parseWindowParam(v: string | null): Top10Window | null {
  return v && (TOP10_WINDOWS as readonly string[]).includes(v)
    ? (v as Top10Window)
    : null;
}
function parseMetricParam(v: string | null): Top10Metric | null {
  return v && (TOP10_METRICS as readonly string[]).includes(v)
    ? (v as Top10Metric)
    : null;
}
function parseAspectParam(v: string | null): ShareAspect | null {
  return v && (ASPECTS as readonly string[]).includes(v)
    ? (v as ShareAspect)
    : null;
}
function parseThemeParam(v: string | null): Top10Theme | null {
  return v && (TOP10_THEMES as readonly string[]).includes(v)
    ? (v as Top10Theme)
    : null;
}

export function Top10Page({
  payload,
  categoryMeta,
  repoSlice,
}: Top10PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initial state derives from URL; falls back to category defaults.
  const initialCategory = parseCategoryParam(searchParams.get("cat")) ?? "repos";
  const initialMeta = categoryMeta[initialCategory];

  const [category, setCategory] = useState<Top10Category>(initialCategory);
  const [window, setWindow] = useState<Top10Window>(
    parseWindowParam(searchParams.get("w")) ?? initialMeta.defaultWindow,
  );
  const [metric, setMetric] = useState<Top10Metric>(
    parseMetricParam(searchParams.get("m")) ?? initialMeta.defaultMetric,
  );
  const [aspect, setAspect] = useState<ShareAspect>(
    parseAspectParam(searchParams.get("aspect")) ?? "h",
  );
  const [theme, setTheme] = useState<Top10Theme>(
    parseThemeParam(searchParams.get("theme")) ?? "dark",
  );

  // Push state to URL whenever it changes. Defaults are stripped so the URL
  // stays clean for the most common view (`/top10`).
  useEffect(() => {
    const m = categoryMeta[category];
    const params = new URLSearchParams();
    if (category !== "repos") params.set("cat", category);
    if (window !== m.defaultWindow) params.set("w", window);
    if (metric !== m.defaultMetric) params.set("m", metric);
    if (aspect !== "h") params.set("aspect", aspect);
    if (theme !== "dark") params.set("theme", theme);
    const qs = params.toString();
    const next = qs ? `/top10?${qs}` : "/top10";
    router.replace(next, { scroll: false });
  }, [category, window, metric, aspect, theme, categoryMeta, router]);

  // For repo-derived categories, recompute the bundle client-side when the
  // user flips window or metric. Other categories use the SSR-baked bundle
  // unchanged. useMemo caches the recompute so unrelated state changes don't
  // re-trigger the sort.
  const liveBundle: Top10Bundle = useMemo(() => {
    if (repoSlice.length === 0) return payload[category];
    if (category === "repos") {
      return buildRepoTop10FromSlice(repoSlice, window, metric);
    }
    if (category === "agents") {
      return buildAgentTop10FromSlice(repoSlice, window, metric);
    }
    if (category === "movers") {
      return buildMoversTop10FromSlice(repoSlice, window);
    }
    return payload[category];
  }, [category, window, metric, repoSlice, payload]);

  const meta = categoryMeta[category];

  function pickCategory(next: Top10Category) {
    setCategory(next);
    const m = categoryMeta[next];
    setWindow(m.defaultWindow);
    setMetric(m.defaultMetric);
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--v3-bg-000, #08090a)" }}>
      <Main
        category={category}
        window={window}
        metric={metric}
        aspect={aspect}
        theme={theme}
        bundle={liveBundle}
        meta={meta}
        payload={payload}
        categoryMeta={categoryMeta}
        onCategory={pickCategory}
        onWindow={setWindow}
        onMetric={setMetric}
        onAspect={setAspect}
        onTheme={setTheme}
      />
    </div>
  );
}

interface MainProps {
  category: Top10Category;
  window: Top10Window;
  metric: Top10Metric;
  aspect: ShareAspect;
  theme: Top10Theme;
  bundle: Top10Bundle;
  meta: CategoryMeta;
  payload: Top10Payload;
  categoryMeta: Record<Top10Category, CategoryMeta>;
  onCategory: (c: Top10Category) => void;
  onWindow: (w: Top10Window) => void;
  onMetric: (m: Top10Metric) => void;
  onAspect: (a: ShareAspect) => void;
  onTheme: (t: Top10Theme) => void;
}

function Main({
  category,
  window,
  metric,
  aspect,
  theme,
  bundle,
  meta,
  payload,
  categoryMeta,
  onCategory,
  onWindow,
  onMetric,
  onAspect,
  onTheme,
}: MainProps) {
  const totalCount = bundle.items.length;
  return (
    <main className="home-surface top10-page">
      <PageHead />

      <CategoryTabs
        active={category}
        counts={Object.fromEntries(
          TOP10_CATEGORIES.map((c) => [c, payload[c].items.length]),
        ) as Record<Top10Category, number>}
        meta={categoryMeta}
        onPick={onCategory}
      />

      <div className="top10-layout">
        <RankingPanel
          category={category}
          window={window}
          metric={metric}
          bundle={bundle}
          totalCount={totalCount}
          onWindow={onWindow}
          onMetric={onMetric}
        />

        <ShareStack
          category={category}
          window={window}
          aspect={aspect}
          theme={theme}
          onAspect={onAspect}
          onTheme={onTheme}
        />
      </div>

      <MoreGrid
        active={category}
        payload={payload}
        meta={categoryMeta}
        onPick={onCategory}
      />

    </main>
  );
}

// ---------------------------------------------------------------------------
// Page head
// ---------------------------------------------------------------------------

function PageHead() {
  return (
    <header className="page-head">
      <div>
        <div className="crumb">
          <b>Tool · 05</b> / top 10 · shareable rankings
        </div>
        <h1>Top 10 — every category, ready to ship.</h1>
        <p className="lede">
          Pick a category, snapshot a chart, and post it. Every ranking renders
          to four social formats in your brand. Updated every 6 hours from the
          corpus.
        </p>
      </div>
      <SnapshotsLink />
      <RefreshClock />
    </header>
  );
}

function SnapshotsLink() {
  // Yesterday's UTC date — matches the snapshot cron's key format. We render
  // the link unconditionally because the frozen route 404s gracefully when no
  // snapshot exists (cold-start), so a dead link is the worst case during the
  // first 24h post-deploy. After that it's a real archive door.
  const yesterday = useMemo(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);
  return (
    <Link
      href={`/top10/${yesterday}`}
      className="pill"
    >
      ⟲ YESTERDAY · {yesterday}
    </Link>
  );
}

function RefreshClock() {
  // 6h cadence matches the upstream collector cron. We show a live countdown
  // pinned to the next 6h boundary in the user's local clock so they see
  // motion and can predict the next refresh. Re-renders once a second; cheap
  // for a single Date.now() + format. SSR fallback: render a static "~ 6H 00M"
  // so the markup is stable, then the client effect swaps in the live ticker.
  const [text, setText] = useState("~ 6H · 00M");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      // Pin to wall-clock 6h boundaries (00 / 06 / 12 / 18) so the surface
      // matches what the cron actually does — not "6h from now."
      const nextBoundary = new Date(now);
      const h = now.getUTCHours();
      const targetHour = Math.ceil((h + 1) / 6) * 6;
      nextBoundary.setUTCHours(targetHour, 0, 0, 0);
      const ms = nextBoundary.getTime() - now.getTime();
      const totalMin = Math.max(0, Math.floor(ms / 60000));
      const hh = Math.floor(totalMin / 60);
      const mm = totalMin % 60;
      setText(`${hh.toString().padStart(2, "0")}H · ${mm.toString().padStart(2, "0")}M`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="clock tabular-nums"
    >
      <span className="big">
        {text}
      </span>
      UNTIL NEXT REFRESH
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category tabs
// ---------------------------------------------------------------------------

interface CategoryTabsProps {
  active: Top10Category;
  counts: Record<Top10Category, number>;
  meta: Record<Top10Category, CategoryMeta>;
  onPick: (c: Top10Category) => void;
}

function CategoryTabs({ active, counts, meta, onPick }: CategoryTabsProps) {
  return (
    <div
      className="flex gap-1.5 mb-3 overflow-x-auto"
      style={{
        border: "1px solid var(--v3-line-200, #29323b)",
        background: "var(--v3-bg-025, #0b0d0f)",
        padding: 6,
      }}
    >
      {TOP10_CATEGORIES.map((c) => {
        const m = meta[c];
        const on = c === active;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="v2-mono"
            style={{
              height: 38,
              padding: "0 14px",
              border: on
                ? "1px solid var(--v2-acc, #f56e0f)"
                : "1px solid transparent",
              background: on ? "var(--v2-acc, #f56e0f)" : "transparent",
              color: on ? "#1a0a04" : "var(--v3-ink-300, #84909b)",
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              cursor: "pointer",
              fontWeight: on ? 700 : 400,
              flex: "none",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{m.emoji}</span>
            {m.label}
            <span
              className="tabular-nums"
              style={{
                fontSize: 9,
                color: on ? "rgba(0,0,0,0.45)" : "var(--v3-ink-500, #3c444d)",
                background: on ? "rgba(0,0,0,0.18)" : "var(--v3-bg-100, #151a20)",
                padding: "2px 7px",
              }}
            >
              {counts[c]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share stack — format picker + preview + actions + meta
// ---------------------------------------------------------------------------

function ShareStack({
  category,
  window,
  aspect,
  theme,
  onAspect,
  onTheme,
}: {
  category: Top10Category;
  window: Top10Window;
  aspect: ShareAspect;
  theme: Top10Theme;
  onAspect: (a: ShareAspect) => void;
  onTheme: (t: Top10Theme) => void;
}) {
  // Permalink — one URL per (cat, window, theme) snapshot. UTM-tagged so a
  // copied/posted link is attributable in analytics. The preview SVG and the
  // shared page point at the same view.
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

  // SVG for in-page preview (renders fast, scales perfectly), PNG for download.
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
      toast.error("Could not copy — clipboard blocked");
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
            PNG · BRANDED
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
      {/* On <md the share stack stops being sticky so the page can scroll
          past the rankings and land on the share controls without losing
          the chart context. */}
      <style>{`
        @media (max-width: 1023px) {
          .share-stack { position: relative !important; top: 0 !important; }
        }
      `}</style>
    </aside>
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
  // The preview frame background tracks the active theme so light/mono cards
  // don't sit on a dark frame that fights their palette.
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
        {/* Cache-bust on category/aspect/theme change so the browser doesn't
            reuse an old SVG when the user flips state. */}
        <img
          key={`${category}-${aspect}-${theme}`}
          src={svgUrl}
          alt={`Top 10 ${category} — ${aspect} ${theme} preview`}
          style={{
            width: "100%",
            height: "100%",
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
        ↓ DOWNLOAD PNG · {ASPECT_LABEL[aspect].px}
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
        ⎘ COPY LINK
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
        𝕏 POST
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

// ---------------------------------------------------------------------------
// More grid — 6 mini lists below the main panel
// ---------------------------------------------------------------------------

function MoreGrid({
  active,
  payload,
  meta,
  onPick,
}: {
  active: Top10Category;
  payload: Top10Payload;
  meta: Record<Top10Category, CategoryMeta>;
  onPick: (c: Top10Category) => void;
}) {
  // Show the 6 categories that aren't the active one (or the active + 5 if
  // we have 7 visible). Keep stable order from TOP10_CATEGORIES.
  const cats = TOP10_CATEGORIES.filter((c) => c !== active).slice(0, 6);
  return (
    <div className="more-grid">
      {cats.map((c) => (
        <Mini
          key={c}
          category={c}
          meta={meta[c]}
          bundle={payload[c]}
          onOpen={() => onPick(c)}
        />
      ))}
    </div>
  );
}

function Mini({
  category,
  meta,
  bundle,
  onOpen,
}: {
  category: Top10Category;
  meta: CategoryMeta;
  bundle: Top10Bundle;
  onOpen: () => void;
}) {
  const top5 = bundle.items.slice(0, 5);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mini text-left"
    >
      <div className="h">
        <span className="em">{meta.emoji}</span>
        <span className="nm">
          TOP 10 · {meta.label}
        </span>
        <span className="ct">
          {windowLabel(bundle.window).toUpperCase()}
        </span>
      </div>
      {top5.length === 0 ? (
        <div
          className="v2-mono"
          style={{
            fontSize: 11,
            color: "var(--v3-ink-400, #909caa)",
            padding: "10px 0",
          }}
        >
          {"// empty"}
        </div>
      ) : (
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 11.5,
            color: "var(--v3-ink-200, #b8c0c8)",
            lineHeight: 1.55,
          }}
        >
          {top5.map((item) => (
            <li key={item.slug} style={{ listStyleType: "decimal" }}>
              <span
                className="font-display"
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.owner ? (
                    <span style={{ color: "var(--v3-ink-400, #909caa)" }}>
                      {item.owner} <span style={{ opacity: 0.4 }}>/</span>{" "}
                    </span>
                  ) : null}
                  {item.title}
                </span>
                <b
                  className="v2-mono tabular-nums"
                  style={{
                    color: "var(--v3-sig-green, #22c55e)",
                    fontWeight: 600,
                    fontSize: 10,
                    letterSpacing: "0.04em",
                  }}
                >
                  {item.deltaPct !== undefined
                    ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
                    : item.score.toFixed(2)}
                </b>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div
        className="v2-mono"
        style={{
          marginTop: 8,
          fontSize: 9,
          letterSpacing: "0.16em",
          color: "var(--v2-acc, #f56e0f)",
          textTransform: "uppercase",
        }}
      >
        ↗ OPEN FULL · SHARE
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildPagePath(
  category: Top10Category,
  window: Top10Window,
  theme: Top10Theme = "dark",
): string {
  const params = new URLSearchParams();
  if (category !== "repos") params.set("cat", category);
  if (window !== CATEGORY_META[category].defaultWindow) params.set("w", window);
  if (theme !== "dark") params.set("theme", theme);
  const qs = params.toString();
  return qs ? `/top10?${qs}` : "/top10";
}

function tweetText(category: Top10Category, window: Top10Window): string {
  const m = CATEGORY_META[category];
  return `Top 10 ${m.label} — ${windowLabel(window).toUpperCase()} window · via @TrendingRepo`;
}

/**
 * Append UTM tracking params to an outbound share URL. Caller passes the
 * absolute page URL (so the params land on /top10, not the current page) and
 * we tag source=top10, medium=share, campaign=<category>. Existing params on
 * the URL are preserved.
 */
function withUtm(absUrl: string, category: Top10Category): string {
  try {
    const u = new URL(absUrl);
    u.searchParams.set("utm_source", "top10");
    u.searchParams.set("utm_medium", "share");
    u.searchParams.set("utm_campaign", category);
    return u.toString();
  } catch {
    // If URL parsing fails (shouldn't, since absoluteUrl produces canonical
    // strings) — fall through with the raw URL so the share doesn't break.
    return absUrl;
  }
}
