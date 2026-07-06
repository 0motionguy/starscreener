// TrendingRepo — /api/og/top10
//
// 4-aspect share card for /top10. Renders any category × window × aspect
// combination as a PNG (default) or SVG (?format=svg). Composition mirrors
// the on-page ranking — all 10 rows on every aspect (2026-05-24 parity pass).
//
// Imports the same builders the page uses so the card and the page can never
// drift on rank order.
//
// Parity contract with src/components/tools/top-10/Top10RankRow.tsx:
//   - No velocity pill (HOT/WARM), no description line.
//   - Orange star (★) prefixes the star count, matching the page row.
//   - For repo-style categories (repos/agents/movers) the row shows avatar +
//     owner/name + ★ stars + delta + sparkline. For news/funding/llms it
//     falls back to the gradient-letter avatar + score, since those slugs
//     don't resolve to a live Repo.
//   - satori (the engine behind next/og) only supports flex + a CSS subset,
//     so we can't reuse Top10RankRow directly. Keep this file visually
//     aligned by hand.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import type { Repo, RepoMentionsRollup, SocialPlatform } from "@/lib/types";

import { Dot, StarMark, truncate } from "@/lib/og-primitives";
import { buildCustomBundleFromSlugs } from "@/lib/top10/build-custom-bundle";
import { formatDelta, formatStars } from "@/lib/top10/format";
import { resolveBundle } from "@/lib/top10/resolve-bundle";
import { SITE_URL } from "@/lib/seo";

// Mirror of CHANNELS in MentionSourcePips.tsx — drives which source logos
// render as pips on the right of each OG row. Order is intentional (matches
// the page's pip ordering). Lobsters is excluded because there's no brand
// SVG in /public/brand/sources/.
const MENTION_CHANNELS: Array<{
  key: SocialPlatform;
  logo: string;
  title: string;
}> = [
  { key: "github", logo: "github", title: "GitHub" },
  { key: "hackernews", logo: "hackernews", title: "Hacker News" },
  { key: "twitter", logo: "x-twitter", title: "X / Twitter" },
  { key: "bluesky", logo: "bluesky", title: "Bluesky" },
  { key: "devto", logo: "devto", title: "Dev.to" },
  { key: "producthunt", logo: "producthunt", title: "Product Hunt" },
  { key: "huggingface", logo: "huggingface", title: "Hugging Face" },
  { key: "arxiv", logo: "arxiv", title: "arXiv" },
  { key: "npm", logo: "npm", title: "npm" },
];

function sourceCount(
  perSource: RepoMentionsRollup["perSource"] | undefined,
  key: SocialPlatform,
): number {
  const channel = perSource?.[key];
  if (!channel) return 0;
  return (
    channel.count ?? Math.max(channel.count24h ?? 0, channel.count7d ?? 0)
  );
}
import {
  CATEGORY_META,
  TOP10_CATEGORIES,
  TOP10_WINDOWS,
  type Top10Bundle,
  type Top10Category,
  type Top10Item,
  type Top10Window,
} from "@/lib/top10/types";
import {
  isValidThemeId,
  TOP10_THEMES,
  type ThemeColors,
  type Top10ThemeId,
} from "@/lib/top10/themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASPECT_DIMENSIONS = {
  h: { width: 1200, height: 675 },
  sq: { width: 1080, height: 1080 },
  v: { width: 1080, height: 1350 },
  yt: { width: 1280, height: 720 },
} as const;

type Aspect = keyof typeof ASPECT_DIMENSIONS;

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=3600";

// ---------------------------------------------------------------------------
// Themes — palette registry lives in src/lib/top10/themes.ts (also consumed
// by the on-page ThemePicker so both surfaces agree pixel-for-pixel). The
// local Theme alias is the id union; THEMES is the colors-only map.
// ---------------------------------------------------------------------------

type Theme = Top10ThemeId;

const THEMES: Record<Theme, ThemeColors> = Object.fromEntries(
  Object.entries(TOP10_THEMES).map(([id, meta]) => [id, meta.colors]),
) as Record<Theme, ThemeColors>;

function parseTheme(value: string | null): Theme {
  return isValidThemeId(value) ? value : "dark";
}

// Convert a #RRGGBB hex string to `rgba(r, g, b, a)` — used to mix the brand
// color with a low-alpha wash on the top-3 row backgrounds, matching the
// page's `linear-gradient(var(--accent-wash), ...)` treatment.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// formatStars + formatDelta now live in @/lib/top10/format so the page row
// and the OG card share one source of truth (round 1 ate a "49k vs 49.5k"
// regression because they had drifted inline copies).

// Build a normalized polyline points string for an inline sparkline SVG.
// Returns "" for series < 2 points so the caller can skip rendering.
function sparklinePolyline(
  points: number[],
  width: number,
  height: number,
): string {
  if (points.length < 2) return "";
  let min = points[0];
  let max = points[0];
  for (const p of points) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  return points
    .map((y, i) => {
      const px = i * stepX;
      const py = height - ((y - min) / range) * height;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// SVG — used for in-page preview and as a download fallback.
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSvg(
  bundle: Top10Bundle,
  category: Top10Category,
  window: Top10Window,
  width: number,
  height: number,
  rowCount: number,
  theme: Theme,
): string {
  const c = THEMES[theme];
  const padX = Math.round(width * 0.06);
  const padTop = Math.round(height * 0.06);
  const headerH = Math.round(height * 0.05);
  const footerH = Math.round(height * 0.06);
  const listTop = padTop + headerH;
  const listH = height - listTop - footerH - padTop * 0.5;
  const rowH = listH / Math.max(1, rowCount);

  const headerSize = Math.round(height * 0.020);
  const dateStr = new Date().toISOString().slice(0, 10);
  const headerLeft = `// TRENDINGREPO · TOP 10 · ${category.toUpperCase()} · ${window.toUpperCase()} · ${dateStr}`;

  const header = `
    <g>
      <text x="${padX}" y="${padTop + headerSize}" font-family="ui-monospace,monospace" font-size="${headerSize}" fill="${c.textTertiary}" letter-spacing="2">${escapeXml(headerLeft)}</text>
      <text x="${width - padX}" y="${padTop + headerSize}" text-anchor="end" font-family="ui-monospace,monospace" font-size="${headerSize}" fill="${c.up}" letter-spacing="2">● LIVE</text>
    </g>
  `;

  const rows = bundle.items
    .slice(0, rowCount)
    .map((item, i) => {
      const y = listTop + i * rowH;
      const railColor =
        i === 0 ? c.rail1 : i === 1 ? c.rail2 : i === 2 ? c.rail3 : c.railRest;
      const titleText = escapeXml(formatItemTitle(item));
      const scoreText =
        item.deltaPct !== undefined
          ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
          : item.score.toFixed(2);
      const rankSize = Math.round(rowH * 0.55);
      const titleSizePx = Math.round(rowH * 0.42);
      const scoreSizePx = Math.round(rowH * 0.36);
      // Orange star glyph anchored just left of the score (text-anchor=end).
      // Approx score-text width = scoreText.length * scoreSizePx * 0.6 (mono).
      const scoreWidth = scoreText.length * scoreSizePx * 0.6;
      const starSize = scoreSizePx * 0.95;
      const starX = width - padX - scoreWidth - starSize - 6;
      const starY = y + rowH * 0.6 - starSize * 0.9;
      return `
        <g>
          <rect x="${padX}" y="${y + 4}" width="3" height="${rowH - 8}" fill="${railColor}"/>
          <text x="${padX + 14}" y="${y + rowH * 0.62}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${rankSize}" fill="${i < 3 ? railColor : c.rankRest}" font-weight="700">${String(item.rank).padStart(2, "0")}</text>
          <text x="${padX + 14 + rankSize * 1.4}" y="${y + rowH * 0.6}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${titleSizePx}" fill="${c.textPrimary}" font-weight="600">${titleText}</text>
          <g transform="translate(${starX}, ${starY}) scale(${starSize / 24})"><path d="M12 2l2.9 6.9L22 10l-5.5 4.5 1.9 7.5L12 18l-6.4 4 1.9-7.5L2 10l7.1-1.1L12 2z" fill="${c.brand}"/></g>
          <text x="${width - padX}" y="${y + rowH * 0.6}" text-anchor="end" font-family="ui-monospace,monospace" font-size="${scoreSizePx}" fill="${c.textPrimary}" font-weight="600">${escapeXml(scoreText)}</text>
        </g>
      `;
    })
    .join("");

  const footerY = height - footerH * 0.4;
  const footer = `
    <g>
      <text x="${padX}" y="${footerY}" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.016)}" fill="${c.textTertiary}" letter-spacing="2">TRENDINGREPO.COM/TOP10</text>
      <text x="${width - padX}" y="${footerY}" text-anchor="end" font-family="ui-monospace,monospace" font-size="${Math.round(height * 0.016)}" fill="${c.textPrimary}" letter-spacing="2">${escapeXml(bundle.meta.totalMovement.toUpperCase())}</text>
      <rect x="0" y="${height - 6}" width="${width}" height="6" fill="${c.accentStrip}"/>
    </g>
  `;

  // Brand corner ticks (matches on-page card)
  const tick = 14;
  const corners = [
    `<polyline points="${padX - 8},${padTop - 8} ${padX - 8 + tick},${padTop - 8} ${padX - 8},${padTop - 8} ${padX - 8},${padTop - 8 + tick}" fill="none" stroke="${c.brand}" stroke-width="1.5"/>`,
    `<polyline points="${width - padX + 8},${padTop - 8} ${width - padX + 8 - tick},${padTop - 8} ${width - padX + 8},${padTop - 8} ${width - padX + 8},${padTop - 8 + tick}" fill="none" stroke="${c.brand}" stroke-width="1.5"/>`,
    `<polyline points="${padX - 8},${height - footerY - 6 + footerH} ${padX - 8 + tick},${height - footerY - 6 + footerH} ${padX - 8},${height - footerY - 6 + footerH} ${padX - 8},${height - footerY - 6 + footerH - tick}" fill="none" stroke="${c.brand}" stroke-width="1.5"/>`,
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${c.bg}"/><g opacity="0.5">${corners}</g>${header}${rows}${footer}</svg>`;
}

function formatItemTitle(item: Top10Item): string {
  const owner = item.owner ? `${item.owner} / ` : "";
  return truncate(`${owner}${item.title}`, 36);
}

// ---------------------------------------------------------------------------
// PNG card via next/og ImageResponse.
// ---------------------------------------------------------------------------

function CardJSX({
  bundle,
  category,
  window,
  width,
  height,
  rowCount,
  theme,
  repoBySlug,
  origin,
}: {
  bundle: Top10Bundle;
  category: Top10Category;
  window: Top10Window;
  width: number;
  height: number;
  rowCount: number;
  theme: Theme;
  repoBySlug: Map<string, Repo>;
  origin: string;
}) {
  const c = THEMES[theme];
  const padding =
    width >= 1200 ? "36px 56px 28px" : width >= 1080 ? "32px 48px 24px" : "28px 40px 22px";

  const subSize = Math.round(height * 0.020);
  const dateStr = new Date().toISOString().slice(0, 10);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: c.bg,
        color: c.textPrimary,
        padding,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* Compact single-line header — brand · category · window · date · LIVE */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "monospace",
          fontSize: subSize,
          color: c.textTertiary,
          letterSpacing: 2,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StarMark size={subSize + 4} color={c.brand} />
          <span style={{ display: "flex", color: c.textPrimary, fontWeight: 600 }}>
            TRENDINGREPO
          </span>
          <span style={{ display: "flex" }}>·</span>
          <span style={{ display: "flex" }}>{`TOP 10`}</span>
          <span style={{ display: "flex" }}>·</span>
          <span style={{ display: "flex" }}>{category.toUpperCase()}</span>
          <span style={{ display: "flex" }}>·</span>
          <span style={{ display: "flex" }}>{window.toUpperCase()}</span>
          <span style={{ display: "flex", color: c.brand, marginLeft: 6 }}>
            {`// ${dateStr}`}
          </span>
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: c.up,
          }}
        >
          <Dot size={subSize} color={c.up} />
          <span style={{ display: "flex" }}>LIVE</span>
        </span>
      </div>

      {/* Rows — wrapped in a card frame with 1px gaps so they read as a
          stacked list, mirroring the .t10-rows treatment on the page. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 22,
          gap: 1,
          backgroundColor: c.railRest,
          borderRadius: 8,
          overflow: "hidden",
          flex: 1,
        }}
      >
        <CardHeaderRow height={height} theme={theme} />
        {bundle.items.slice(0, rowCount).map((item, i) => (
          <CardRow
            key={item.slug}
            item={item}
            index={i}
            height={height}
            theme={theme}
            liveRepo={repoBySlug.get(item.slug.toLowerCase()) ?? null}
            origin={origin}
          />
        ))}
        {bundle.items.length === 0 && (
          <span
            style={{
              display: "flex",
              fontFamily: "monospace",
              color: c.textTertiary,
              fontSize: subSize,
            }}
          >
            {"// no entries yet — check back after the next refresh"}
          </span>
        )}
      </div>

      {/* Bottom stats strip — 4 cells matching the page's .t10-meta grid
          (Movement, Mean Score, Hottest, Coldest). Uses 1px gap with the
          railRest bg-fill trick the rows container uses, so it reads as a
          framed bar instead of four floating cells. */}
      <div
        style={{
          display: "flex",
          marginTop: 10,
          gap: 1,
          backgroundColor: c.railRest,
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid ${c.railRest}`,
        }}
      >
        <StatCell
          label="movement"
          value={bundle.meta.totalMovement}
          sub={bundle.meta.totalMovementSub}
          height={height}
          theme={theme}
        />
        <StatCell
          label="mean score"
          value={bundle.meta.meanScore}
          sub={bundle.meta.meanScoreSub}
          height={height}
          theme={theme}
        />
        <StatCell
          label="hottest"
          value={bundle.meta.hottest}
          sub={bundle.meta.hottestSub}
          height={height}
          theme={theme}
          tone="hot"
        />
        <StatCell
          label="coldest"
          value={bundle.meta.coldest ?? "—"}
          sub={bundle.meta.coldestSub}
          height={height}
          theme={theme}
          tone="cold"
        />
      </div>

      {/* Accent strip — URL footer dropped because the stats strip above
          already carries `+18% net`; repeating it just stole vertical room. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          backgroundColor: c.accentStrip,
          display: "flex",
        }}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  height,
  theme,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  height: number;
  theme: Theme;
  tone?: "hot" | "cold";
}) {
  const c = THEMES[theme];
  const labelSize = Math.round(height * 0.014);
  const valueSize = Math.round(height * 0.024);
  const subSize = Math.round(height * 0.014);
  const valueColor =
    tone === "hot"
      ? c.brand
      : tone === "cold"
        ? c.textTertiary
        : c.textPrimary;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 3,
        padding: "10px 14px",
        backgroundColor: c.bg,
      }}
    >
      <span
        style={{
          display: "flex",
          fontFamily: "monospace",
          fontSize: labelSize,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: c.textTertiary,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "flex",
          fontFamily: "monospace",
          fontSize: valueSize,
          color: valueColor,
          fontWeight: 500,
        }}
      >
        {truncate(value, 22)}
      </span>
      {sub ? (
        <span
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: subSize,
            color: c.textTertiary,
            letterSpacing: 1,
          }}
        >
          {truncate(sub, 28)}
        </span>
      ) : null}
    </div>
  );
}

// Column-header row above the OG card rows. Labels the naked numeric cells
// (24H / 7D / STARS / MENTIONS) so the OG card reads identically to the page.
// Widths match CardRow + MentionPipsCell exactly so columns align.
function CardHeaderRow({ height, theme }: { height: number; theme: Theme }) {
  const c = THEMES[theme];
  const labelSize = Math.round(height * 0.018);
  const avatarSize = Math.round(height * 0.046);
  const mentionsW = Math.round(height * 0.22);

  const labelStyle = {
    display: "flex",
    fontFamily: "monospace",
    fontSize: labelSize,
    letterSpacing: 2,
    color: c.textTertiary,
    textTransform: "uppercase" as const,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "6px 14px",
        backgroundColor: c.bg,
        borderLeft: "3px solid transparent",
      }}
    >
      <span style={{ display: "flex", width: 44 }} />
      <span style={{ display: "flex", width: avatarSize }} />
      <span style={{ display: "flex", flex: 1 }} />
      <span style={{ ...labelStyle, width: 72, justifyContent: "flex-end" }}>
        24H
      </span>
      <span style={{ ...labelStyle, width: 72, justifyContent: "flex-end" }}>
        7D
      </span>
      <span style={{ ...labelStyle, width: 100, justifyContent: "flex-end" }}>
        STARS
      </span>
      <span style={{ display: "flex", width: Math.round(height * 0.115) }} />
      <span style={{ ...labelStyle, width: mentionsW, justifyContent: "flex-end" }}>
        MENTIONS
      </span>
    </div>
  );
}

function CardRow({
  item,
  index,
  height,
  theme,
  liveRepo,
  origin,
}: {
  item: Top10Item;
  index: number;
  height: number;
  theme: Theme;
  liveRepo: Repo | null;
  origin: string;
}) {
  const c = THEMES[theme];
  const isTop3 = index < 3;

  const rowFontTitle = Math.round(height * 0.030);
  const rowFontRank = isTop3
    ? Math.round(height * 0.040)
    : Math.round(height * 0.034);
  const rowFontStars = Math.round(height * 0.026);
  const avatarSize = Math.round(height * 0.046);

  const owner = item.owner ?? "";
  const name = item.title;

  // Star count: prefer live Repo.stars when we have it (repos/agents/movers),
  // fall back to the snapshot's deltaPct / score for news / funding / llms.
  // Uses formatStars (1-decimal in 10k-100k) to match the on-page format.
  const stars = liveRepo?.stars;
  const starsLabel =
    stars !== undefined
      ? formatStars(stars)
      : item.deltaPct !== undefined
        ? `${item.deltaPct >= 0 ? "+" : ""}${item.deltaPct.toFixed(0)}%`
        : item.score.toFixed(2);

  // Deltas: matches page's formatDelta — "+594" / "+1.3k" / "·" / "—".
  // 24h is missing when no live repo at all. 7d has its own missing flag for
  // "genuinely flat" vs "unknown yet" distinction (matches page).
  const delta24h = formatDelta(liveRepo?.starsDelta24h ?? 0, !liveRepo);
  const delta7d = formatDelta(
    liveRepo?.starsDelta7d ?? 0,
    liveRepo?.starsDelta7dMissing ?? !liveRepo,
  );
  const deltaColor = (d: typeof delta24h) =>
    d.sign === "up" ? c.up : c.textTertiary;

  // Sparkline: snapshot-frozen series wins, fall back to live spine.
  const sparkPoints =
    item.sparkline && item.sparkline.length > 1
      ? item.sparkline
      : (liveRepo?.sparklineData?.slice(-30) ?? []);
  const sparkW = Math.round(height * 0.115);
  const sparkH = Math.round(height * 0.030);
  const sparkPath = sparklinePolyline(sparkPoints, sparkW, sparkH);
  const sparkRising =
    sparkPoints.length > 1 &&
    sparkPoints[sparkPoints.length - 1] >= sparkPoints[0];
  const sparkColor = sparkRising ? c.up : c.textTertiary;

  const avatarBg = `linear-gradient(135deg, ${item.avatarGradient[0]}, ${item.avatarGradient[1]})`;

  // Top-3 wash + orange left rail mirror the page's `.t10-row.top3`
  // treatment. Composed inline (no `undefined`/spread) because satori is
  // picky about partial style objects with the linear-gradient path.
  const rowBg = isTop3 ? hexToRgba(c.brand, 0.08) : c.bg;
  const railColor = isTop3 ? c.brand : "transparent";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "5px 14px",
        backgroundColor: rowBg,
        borderLeft: `3px solid ${railColor}`,
      }}
    >
      <span
        style={{
          display: "flex",
          fontSize: rowFontRank,
          fontWeight: 700,
          color: isTop3 ? c.brand : c.rankRest,
          width: 44,
          fontFamily: "monospace",
        }}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      {liveRepo?.ownerAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- satori needs raw <img>
        <img
          src={liveRepo.ownerAvatarUrl}
          width={avatarSize}
          height={avatarSize}
          alt=""
          style={{
            display: "flex",
            borderRadius: 2,
            backgroundColor: c.textTertiary,
          }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: avatarSize,
            height: avatarSize,
            backgroundImage: avatarBg,
            color: c.bg,
            fontFamily: "monospace",
            fontWeight: 700,
            fontSize: Math.round(avatarSize * 0.5),
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 2,
          }}
        >
          {item.avatarLetter}
        </div>
      )}
      <span
        style={{
          display: "flex",
          flex: 1,
          fontSize: rowFontTitle,
          color: c.textPrimary,
          fontWeight: 500,
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {owner ? (
          <>
            <span style={{ display: "flex", color: c.textTertiary }}>
              {owner}
            </span>
            <span
              style={{
                display: "flex",
                color: c.textTertiary,
                opacity: 0.55,
                padding: "0 4px",
              }}
            >
              /
            </span>
            <span style={{ display: "flex", color: c.textPrimary }}>
              {truncate(name, 32)}
            </span>
          </>
        ) : (
          <span style={{ display: "flex" }}>{truncate(name, 40)}</span>
        )}
      </span>
      <span
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: 72,
          fontFamily: "monospace",
          fontSize: Math.round(rowFontStars * 0.95),
          color: deltaColor(delta24h),
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {delta24h.text}
      </span>
      <span
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: 72,
          fontFamily: "monospace",
          fontSize: Math.round(rowFontStars * 0.95),
          color: deltaColor(delta7d),
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {delta7d.text}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
          width: 100,
          fontFamily: "monospace",
          fontSize: rowFontStars,
          fontWeight: 600,
          color: c.textPrimary,
        }}
      >
        <StarMark size={rowFontStars} color={c.brand} />
        <span style={{ display: "flex" }}>{starsLabel}</span>
      </span>
      {sparkPath ? (
        <svg
          width={sparkW}
          height={sparkH}
          viewBox={`0 0 ${sparkW} ${sparkH}`}
          style={{ display: "flex" }}
        >
          <polyline
            points={sparkPath}
            fill="none"
            stroke={sparkColor}
            strokeWidth={1.5}
          />
        </svg>
      ) : (
        <span style={{ display: "flex", width: sparkW }} />
      )}
      <MentionPipsCell
        liveRepo={liveRepo}
        height={height}
        theme={theme}
        origin={origin}
      />
    </div>
  );
}

function MentionPipsCell({
  liveRepo,
  height,
  theme,
  origin,
}: {
  liveRepo: Repo | null;
  height: number;
  theme: Theme;
  origin: string;
}) {
  const c = THEMES[theme];
  const pipSize = Math.round(height * 0.028);
  const countSize = Math.round(height * 0.022);
  const cellWidth = Math.round(height * 0.22);

  const rollup = liveRepo?.mentions?.perSource;
  const active = MENTION_CHANNELS.map((ch) => ({
    ...ch,
    n: sourceCount(rollup, ch.key),
  })).filter((ch) => ch.n > 0);
  const visible = active.slice(0, 4);
  const overflow = active.length - visible.length;
  const total =
    liveRepo?.mentions?.total ??
    liveRepo?.mentions?.total24h ??
    liveRepo?.mentionCount24h ??
    0;

  if (active.length === 0 && total === 0) {
    return (
      <span
        style={{
          display: "flex",
          width: cellWidth,
          justifyContent: "flex-end",
          color: c.textTertiary,
          fontFamily: "monospace",
          fontSize: countSize * 0.8,
        }}
      >
        —
      </span>
    );
  }

  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: cellWidth,
        justifyContent: "flex-end",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {visible.map((ch) => (
          // eslint-disable-next-line @next/next/no-img-element -- satori needs raw <img>
          <img
            key={ch.key}
            src={`${origin}/brand/sources/${ch.logo}.svg`}
            width={pipSize}
            height={pipSize}
            alt=""
            style={{ display: "flex" }}
          />
        ))}
        {overflow > 0 ? (
          <span
            style={{
              display: "flex",
              fontFamily: "monospace",
              fontSize: countSize * 0.7,
              color: c.textTertiary,
              marginLeft: 2,
            }}
          >
            +{overflow}
          </span>
        ) : null}
      </span>
      {total > 0 ? (
        <span
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: countSize,
            color: c.textPrimary,
            fontWeight: 600,
          }}
        >
          {total.toLocaleString("en-US")}
        </span>
      ) : null}
    </span>
  );
}


// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

function parseCategory(value: string | null): Top10Category {
  if (!value) return "repos";
  return TOP10_CATEGORIES.includes(value as Top10Category)
    ? (value as Top10Category)
    : "repos";
}

function parseWindow(
  value: string | null,
  fallback: Top10Window,
): Top10Window {
  if (!value) return fallback;
  return TOP10_WINDOWS.includes(value as Top10Window)
    ? (value as Top10Window)
    : fallback;
}

function parseAspect(value: string | null): Aspect {
  if (value === "sq" || value === "v" || value === "yt" || value === "h") {
    return value;
  }
  return "h";
}

export async function GET(request: NextRequest) {
  Sentry.setTag("route", "api/og/top10");

  const { searchParams } = new URL(request.url);
  const category = parseCategory(searchParams.get("cat"));
  const window = parseWindow(
    searchParams.get("window"),
    CATEGORY_META[category].defaultWindow,
  );
  const aspect = parseAspect(searchParams.get("aspect"));
  const format = searchParams.get("format") === "svg" ? "svg" : "png";
  const theme = parseTheme(searchParams.get("theme"));
  const dim = ASPECT_DIMENSIONS[aspect];

  Sentry.setTag("og.category", category);
  Sentry.setTag("og.window", window);
  Sentry.setTag("og.aspect", aspect);
  Sentry.setTag("og.format", format);

  // All aspects render all 10 rows by default (2026-05-24 parity pass — was a
  // 5/10 split). `?rows=3..10` overrides for the X pack cards (CE-2): a 5-row
  // listicle card renders taller rows + bigger type from the same layout math.
  const rowsRaw = Number.parseInt(searchParams.get("rows") ?? "", 10);
  const rowCount = Number.isFinite(rowsRaw)
    ? Math.min(10, Math.max(3, rowsRaw))
    : 10;

  // 2026-05-25: date archive dropped — OG always renders today's live
  // ranking (or a user-composed `?my=` list). The `?date=` param is still
  // tolerated for back-compat with cached share links but is ignored.

  // `?my=slug1,slug2,…` — user-composed top 10. Overrides live so the share
  // card always reflects exactly the slugs in the URL.
  const myParam = searchParams.get("my");
  const mySlugs = myParam
    ? myParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10)
    : [];

  try {
    const bundle: Top10Bundle =
      mySlugs.length > 0
        ? buildCustomBundleFromSlugs(mySlugs, window)
        : await resolveBundle(category, window);

    // Resolve live Repo data for repo-style categories so the row can render
    // avatar + real star count + 7d delta + sparkline. News/funding/llms
    // items don't have a repo backing — Map.get returns undefined and CardRow
    // gracefully falls back to the gradient-letter avatar + snapshot score.
    const repoBySlug = new Map<string, Repo>();
    if (category === "repos" || category === "agents" || category === "movers") {
      for (const item of bundle.items) {
        try {
          const repo = getDerivedRepoByFullName(item.slug);
          if (repo) repoBySlug.set(item.slug.toLowerCase(), repo);
        } catch {
          // Derived spine missing on cold deploy — fall through to snapshot.
        }
      }
    }

    if (format === "svg") {
      const svg = buildSvg(
        bundle,
        category,
        window,
        dim.width,
        dim.height,
        rowCount,
        theme,
      );
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": CACHE_HEADER,
          ...(searchParams.get("download") === "1"
            ? {
                "Content-Disposition": `attachment; filename="top10-${category}-${aspect}-${theme}-${todayStamp()}.svg"`,
              }
            : {}),
        },
      });
    }

    // Origin for absolute <img> URLs inside satori — brand SVGs at
    // /brand/sources/*.svg need to resolve to a fully-qualified URL.
    const origin = SITE_URL;

    return new ImageResponse(
      (
        <CardJSX
          bundle={bundle}
          category={category}
          window={window}
          width={dim.width}
          height={dim.height}
          rowCount={rowCount}
          theme={theme}
          repoBySlug={repoBySlug}
          origin={origin}
        />
      ),
      {
        ...dim,
        headers: { "Cache-Control": CACHE_HEADER },
      },
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        route: "api/og/top10",
        category,
        window,
        aspect,
        format,
      },
    });
    throw err;
  }
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
