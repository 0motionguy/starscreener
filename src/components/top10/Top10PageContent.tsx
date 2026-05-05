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

import { Sparkline } from "@/components/shared/Sparkline";
import { ShareSurface, type ShareAspect } from "@/components/top10/share-surface";
import {
  buildAgentTop10FromSlice,
  buildMoversTop10FromSlice,
  buildRepoTop10FromSlice,
} from "@/lib/top10/builders";
import {
  TOP10_CATEGORIES,
  TOP10_METRICS,
  TOP10_WINDOWS,
  type CategoryMeta,
  type RepoSliceLite,
  type Top10Bundle,
  type Top10Category,
  type Top10Item,
  type Top10Metric,
  type Top10Payload,
  type Top10Theme,
  type Top10Window,
} from "@/lib/top10/types";
import { windowLabel } from "@/lib/top10/labels";
import {
  coerceSelection,
  isMetricSupported,
  parseTop10Query,
} from "@/lib/top10/view-rules";

interface Top10PageProps {
  payload: Top10Payload;
  categoryMeta: Record<Top10Category, CategoryMeta>;
  /** Server-shipped 80-row slice for client-side window/metric recompute. */
  repoSlice: RepoSliceLite[];
}

const METRIC_LABEL: Record<Top10Metric, string> = {
  "cross-signal": "CROSS-SIGNAL",
  stars: "STARS",
  mentions: "MENTIONS",
  velocity: "VELOCITY",
};

// ---------------------------------------------------------------------------
// URL sync — read once at mount, push back on every state change. Using
// `replace` (not `push`) so the back button doesn't fill with intermediate
// states. searchParams is a snapshot; router.replace handles the URL update
// without re-rendering the server tree.
// ---------------------------------------------------------------------------

export function Top10Page({
  payload,
  categoryMeta,
  repoSlice,
}: Top10PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initial state derives from URL; invalid params are coerced to category defaults.
  const initialSelection = parseTop10Query(searchParams, categoryMeta);

  const [category, setCategory] = useState<Top10Category>(initialSelection.category);
  const [window, setWindow] = useState<Top10Window>(initialSelection.window);
  const [metric, setMetric] = useState<Top10Metric>(initialSelection.metric);
  const [aspect, setAspect] = useState<ShareAspect>(initialSelection.aspect);
  const [theme, setTheme] = useState<Top10Theme>(initialSelection.theme);

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
    const nextMeta = categoryMeta[next];
    const nextSelection = coerceSelection(
      {
        category: next,
        window: nextMeta.defaultWindow,
        metric: nextMeta.defaultMetric,
        aspect,
        theme,
      },
      categoryMeta,
    );
    setCategory(nextSelection.category);
    setWindow(nextSelection.window);
    setMetric(nextSelection.metric);
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

        <ShareSurface
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
// Ranking panel
// ---------------------------------------------------------------------------

interface RankingPanelProps {
  category: Top10Category;
  window: Top10Window;
  metric: Top10Metric;
  bundle: Top10Bundle;
  totalCount: number;
  onWindow: (w: Top10Window) => void;
  onMetric: (m: Top10Metric) => void;
}

function RankingPanel({
  category,
  window,
  metric,
  bundle,
  totalCount,
  onWindow,
  onMetric,
}: RankingPanelProps) {
  return (
    <section
      className="flex flex-col min-w-0"
      style={{
        border: "1px solid var(--v3-line-200, #29323b)",
        background: "var(--v3-bg-025, #0b0d0f)",
      }}
    >
      <PanelHead
        title={`// TOP 10 · ${category.toUpperCase()}`}
        subtitle={`· LIVE · ${windowLabel(window).toUpperCase()} WINDOW`}
        right={
          totalCount > 0
            ? `${totalCount} ENTRIES`
            : "WAITING FOR FRESH DATA"
        }
      />
      <FilterRow
        category={category}
        window={window}
        metric={metric}
        supportedWindows={bundle.supportedWindows}
        onWindow={onWindow}
        onMetric={onMetric}
      />
      {bundle.items.length === 0 ? (
        <EmptyRows />
      ) : (
        <div>
          {bundle.items.map((item) => (
            <RankRow
              key={`${category}-${item.slug}`}
              item={item}
              category={category}
            />
          ))}
        </div>
      )}
      <RankingMetaStrip meta={bundle.meta} />
    </section>
  );
}

function PanelHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right: string;
}) {
  return (
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
        {title}
      </span>
      <span style={{ color: "var(--v3-ink-400, #909caa)" }}>{subtitle}</span>
      <span
        style={{
          marginLeft: "auto",
          color: "var(--v3-sig-green, #22c55e)",
        }}
      >
        {right}
      </span>
    </div>
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

interface FilterRowProps {
  category: Top10Category;
  window: Top10Window;
  metric: Top10Metric;
  supportedWindows: Top10Window[];
  onWindow: (w: Top10Window) => void;
  onMetric: (m: Top10Metric) => void;
}

/**
 * Which metrics each category supports — only repo-derived categories carry
 * the per-window deltas that drive STARS / VELOCITY / MENTIONS sorting.
 * Non-repo readers ship a single signalScore and ignore other chips.
 */
function FilterRow({
  category,
  window,
  metric,
  supportedWindows,
  onWindow,
  onMetric,
}: FilterRowProps) {
  const supportedW = new Set(supportedWindows);
  return (
    <div
      className="flex gap-1.5 px-3 py-2 items-center flex-wrap"
      style={{
        borderBottom: "1px solid var(--v3-line-200, #29323b)",
        background: "var(--v3-bg-050, #101418)",
      }}
    >
      <ChipLabel>WINDOW</ChipLabel>
      {TOP10_WINDOWS.map((w) => (
        <Chip
          key={w}
          on={w === window}
          disabled={!supportedW.has(w)}
          onClick={() => supportedW.has(w) && onWindow(w)}
        >
          {windowLabel(w).toUpperCase()}
        </Chip>
      ))}
      <span
        style={{
          width: 1,
          height: 18,
          background: "var(--v3-line-200, #29323b)",
          margin: "0 4px",
        }}
      />
      <ChipLabel>METRIC</ChipLabel>
      {TOP10_METRICS.map((m) => (
        <Chip
          key={m}
          on={m === metric}
          disabled={!isMetricSupported(category, m)}
          onClick={() => isMetricSupported(category, m) && onMetric(m)}
        >
          {METRIC_LABEL[m]}
        </Chip>
      ))}
    </div>
  );
}

function ChipLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="v2-mono"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        color: "var(--v3-ink-400, #909caa)",
        textTransform: "uppercase",
        marginRight: 4,
      }}
    >
      {children}
    </span>
  );
}

function Chip({
  children,
  on,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className="v2-mono"
      style={{
        height: 24,
        padding: "0 9px",
        border: on
          ? "1px solid var(--v3-ink-100, #eef0f2)"
          : "1px solid var(--v3-line-300, #3a444f)",
        background: on
          ? "var(--v3-ink-100, #eef0f2)"
          : "var(--v3-bg-100, #151a20)",
        color: on
          ? "#08090a"
          : disabled
            ? "var(--v3-ink-500, #3c444d)"
            : "var(--v3-ink-300, #84909b)",
        fontSize: 9.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: on ? 700 : 400,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rank row
// ---------------------------------------------------------------------------

function RankRow({
  item,
  category,
}: {
  item: Top10Item;
  category: Top10Category;
}) {
  const isTop = item.rank <= 3;
  const railColor =
    item.rank === 1
      ? "#ffd24d"
      : item.rank === 2
        ? "#c0c5cc"
        : item.rank === 3
          ? "#cd7f32"
          : "transparent";
  const rankColor =
    item.rank === 1
      ? "#ffd24d"
      : item.rank === 2
        ? "#c0c5cc"
        : item.rank === 3
          ? "#cd7f32"
          : "var(--v3-ink-300, #84909b)";

  return (
    <Link
      href={item.href}
      target={item.href.startsWith("http") ? "_blank" : undefined}
      rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="block hover:bg-[var(--v3-bg-050,#101418)] relative cursor-pointer"
      style={{
        display: "grid",
        gridTemplateColumns: "44px 36px minmax(0,1fr) 120px 110px 24px",
        gap: 12,
        padding: "10px 14px",
        alignItems: "center",
        borderBottom: "1px solid var(--v3-line-100, #1b2229)",
      }}
    >
      {isTop && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: railColor,
          }}
        />
      )}
      <span
        className="font-display tabular-nums"
        style={{
          fontWeight: 600,
          fontSize:
            item.rank === 1
              ? 30
              : item.rank === 2
                ? 28
                : item.rank === 3
                  ? 26
                  : 24,
          color: rankColor,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      <Avatar item={item} />
      <Body item={item} category={category} />
      <Metric score={item.score} />
      <Delta delta={item.deltaPct} sparkline={item.sparkline} />
      <span
        className="text-center"
        style={{ color: "var(--v3-ink-500, #3c444d)" }}
      >
        →
      </span>
    </Link>
  );
}

function Avatar({ item }: { item: Top10Item }) {
  return (
    <span
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        background: `linear-gradient(135deg, ${item.avatarGradient[0]}, ${item.avatarGradient[1]})`,
        flex: "none",
        fontFamily: "var(--font-display, system-ui)",
      }}
    >
      {item.avatarLetter}
    </span>
  );
}

function Body({ item, category }: { item: Top10Item; category: Top10Category }) {
  return (
    <span style={{ minWidth: 0, display: "block" }}>
      <span
        className="font-display"
        style={{
          fontSize: 14.5,
          color: "var(--v3-ink-000, #fff)",
          fontWeight: 500,
          letterSpacing: "-0.012em",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {item.owner ? (
          <>
            <span style={{ color: "var(--v3-ink-300, #84909b)", fontWeight: 400 }}>
              {item.owner}
            </span>
            <span style={{ color: "var(--v3-ink-500, #3c444d)" }}>/</span>
          </>
        ) : null}
        <span>{item.title}</span>
        {item.badges.map((b) => (
          <Badge key={b} kind={b} />
        ))}
      </span>
      <span
        className="font-display"
        style={{
          fontSize: 11.5,
          color: "var(--v3-ink-300, #84909b)",
          marginTop: 2,
          lineHeight: 1.4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 1,
          WebkitBoxOrient: "vertical",
        }}
      >
        {item.description}
      </span>
      <span style={{ display: "none" }}>{category}</span>
    </span>
  );
}

function Badge({ kind }: { kind: Top10Item["badges"][number] }) {
  const map: Record<
    Top10Item["badges"][number],
    { label: string; bg: string; color: string; border: string }
  > = {
    FIRING_5: {
      label: "5/5 FIRING",
      bg: "rgba(34,197,94,0.14)",
      color: "var(--v3-sig-green, #22c55e)",
      border: "rgba(34,197,94,0.4)",
    },
    FIRING_4: {
      label: "4/5 FIRING",
      bg: "rgba(34,197,94,0.10)",
      color: "var(--v3-sig-green, #22c55e)",
      border: "rgba(34,197,94,0.35)",
    },
    FIRING_3: {
      label: "3/5 FIRING",
      bg: "transparent",
      color: "var(--v3-ink-300, #84909b)",
      border: "var(--v3-line-300, #3a444f)",
    },
    NEW: {
      label: "NEW ENTRY",
      bg: "var(--v2-acc-soft, rgba(245,110,15,0.14))",
      color: "var(--v2-acc, #f56e0f)",
      border: "rgba(245,110,15,0.4)",
    },
    HOT: {
      label: "HOT",
      bg: "rgba(255,77,77,0.14)",
      color: "var(--v3-sig-red, #ff4d4d)",
      border: "rgba(255,77,77,0.4)",
    },
  };
  const t = map[kind];
  return (
    <span
      className="v2-mono"
      style={{
        height: 18,
        padding: "0 7px",
        fontSize: 9,
        letterSpacing: "0.14em",
        display: "inline-flex",
        alignItems: "center",
        textTransform: "uppercase",
        border: `1px solid ${t.border}`,
        color: t.color,
        background: t.bg,
      }}
    >
      {t.label}
    </span>
  );
}

function Metric({ score }: { score: number }) {
  return (
    <span
      className="v2-mono tabular-nums"
      style={{ textAlign: "right", display: "block" }}
    >
      <span
        style={{
          fontSize: 14,
          color: "var(--v3-ink-100, #eef0f2)",
          fontWeight: 600,
        }}
      >
        {score.toFixed(2)}
      </span>
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--v3-ink-400, #909caa)",
          textTransform: "uppercase",
          marginTop: 1,
        }}
      >
        / 5.0
      </span>
    </span>
  );
}

function Delta({
  delta,
  sparkline,
}: {
  delta: number | undefined;
  sparkline: number[] | undefined;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <span
      className="v2-mono tabular-nums"
      style={{ textAlign: "right", display: "block" }}
    >
      <span
        style={{
          fontSize: 12.5,
          color:
            delta === undefined
              ? "var(--v3-ink-400, #909caa)"
              : positive
                ? "var(--v3-sig-green, #22c55e)"
                : "var(--v3-sig-red, #ff4d4d)",
          fontWeight: 600,
        }}
      >
        {delta === undefined
          ? "—"
          : `${positive ? "+" : ""}${delta.toFixed(0)}%`}
      </span>
      {sparkline && sparkline.length >= 2 && (
        <span style={{ display: "block", marginTop: 2 }}>
          <Sparkline
            data={sparkline}
            width={64}
            height={18}
            positive={positive}
          />
        </span>
      )}
      <span
        style={{
          display: "block",
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--v3-ink-400, #909caa)",
          textTransform: "uppercase",
          marginTop: 1,
        }}
      >
        7D
      </span>
    </span>
  );
}

function EmptyRows() {
  return (
    <div
      className="v2-mono"
      style={{
        padding: "24px 14px",
        textAlign: "center",
        color: "var(--v3-ink-400, #909caa)",
        fontSize: 11,
        letterSpacing: "0.14em",
      }}
    >
      {"// no entries yet — check back after the next refresh"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta strip under the ranking
// ---------------------------------------------------------------------------

function RankingMetaStrip({ meta }: { meta: Top10Bundle["meta"] }) {
  const cells: Array<{
    lbl: string;
    v: string;
    sub?: string;
    sub_color?: string;
  }> = [
    {
      lbl: "Total movement",
      v: meta.totalMovement,
      sub: meta.totalMovementSub,
      sub_color: "var(--v3-sig-green, #22c55e)",
    },
    {
      lbl: "Mean score",
      v: meta.meanScore,
      sub: meta.meanScoreSub,
      sub_color: "var(--v3-sig-green, #22c55e)",
    },
    {
      lbl: "Hottest mover",
      v: meta.hottest,
      sub: meta.hottestSub,
      sub_color: "var(--v3-sig-green, #22c55e)",
    },
    {
      lbl: "Coldest mover",
      v: meta.coldest ?? "—",
      sub: meta.coldestSub,
      sub_color: meta.coldest ? "var(--v3-sig-red, #ff4d4d)" : undefined,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        borderTop: "1px solid var(--v3-line-200, #29323b)",
      }}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            padding: "10px 14px",
            borderRight:
              i < cells.length - 1
                ? "1px solid var(--v3-line-200, #29323b)"
                : "none",
          }}
        >
          <div
            className="v2-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.20em",
              color: "var(--v3-ink-400, #909caa)",
              textTransform: "uppercase",
            }}
          >
            {c.lbl}
          </div>
          <div
            className="v2-mono tabular-nums"
            style={{
              fontSize: 14,
              color:
                c.lbl === "Coldest mover" && c.v !== "—"
                  ? "var(--v3-sig-red, #ff4d4d)"
                  : "var(--v3-ink-000, #fff)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.v}
          </div>
          {c.sub && (
            <div
              className="v2-mono"
              style={{
                fontSize: 9.5,
                color: c.sub_color ?? "var(--v3-ink-400, #909caa)",
                letterSpacing: "0.10em",
                marginTop: 2,
              }}
            >
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// More grid - 6 mini lists below the main panel
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



