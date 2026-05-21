// GET /api/og/repo/[owner]/[name] — Per-repo share card.
//
// Dynamic OG endpoint for the most-shared surface (repo detail). Pulls
// the repo's live data via the same derived-repos pipeline the page uses,
// so the share card never lags the table. Composition:
//
//   Header  — wordmark + route path (owner/name)
//   Hero    — repo full name + first line of description
//   KPI row — stars · 24h Δ · 7d Δ · mentions (only the ones that resolve)
//   Footer  — domain + "share card"
//
// Falls back to a friendly NotFoundCard when the repo isn't in the corpus
// so the X / LinkedIn crawler still gets a real PNG.

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  AccentStrip,
  CardFrame,
  NotFoundCard,
  StarMark,
  Wordmark,
  truncate,
} from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";
import { refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

// owner/name segments: GitHub allows letters / digits / dot / underscore /
// dash. Mirror that here so the route can't be probed with path-injection
// payloads.
const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000).toLocaleString("en-US")}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function formatSignedDelta(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return "—";
  return `${n > 0 ? "+" : ""}${formatCompact(n)}`;
}

function renderRepoCard(repo: Repo): ReactElement {
  const mentions =
    repo.mentions?.total7d ?? repo.mentions?.total24h ?? repo.mentionCount24h ?? 0;
  const tiles: Array<{ label: string; value: string; tone: "primary" | "up" | "down" }> = [];
  tiles.push({
    label: "STARS",
    value: formatCompact(repo.stars ?? 0),
    tone: "primary",
  });
  if (repo.starsDelta24h !== null && repo.starsDelta24h !== undefined) {
    tiles.push({
      label: "24H Δ",
      value: formatSignedDelta(repo.starsDelta24h),
      tone: (repo.starsDelta24h ?? 0) >= 0 ? "up" : "down",
    });
  }
  if (repo.starsDelta7d !== null && repo.starsDelta7d !== undefined) {
    tiles.push({
      label: "7D Δ",
      value: formatSignedDelta(repo.starsDelta7d),
      tone: (repo.starsDelta7d ?? 0) >= 0 ? "up" : "down",
    });
  }
  if (mentions > 0) {
    tiles.push({
      label: "MENTIONS",
      value: formatCompact(mentions),
      tone: "primary",
    });
  }

  return (
    <CardFrame>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Wordmark fontSize={28} />
        <span
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: 18,
            color: OG_COLORS.textTertiary,
            letterSpacing: "0.06em",
          }}
        >
          /repo/{truncate(repo.fullName, 48)}
        </span>
      </div>

      {/* Hero */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
        <span
          style={{
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
          }}
        >
          {truncate(repo.fullName, 36)}
        </span>
        {repo.description ? (
          <span
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 24,
              color: OG_COLORS.textSecondary,
              maxWidth: 980,
              lineHeight: 1.35,
            }}
          >
            {truncate(repo.description, 140)}
          </span>
        ) : null}
        {repo.language ? (
          <span
            style={{
              display: "flex",
              marginTop: 14,
              fontFamily: "monospace",
              fontSize: 16,
              color: OG_COLORS.textTertiary,
              letterSpacing: "0.08em",
            }}
          >
            {repo.language.toUpperCase()}
          </span>
        ) : null}
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "flex",
          marginTop: 32,
          gap: 14,
        }}
      >
        {tiles.map((tile) => (
          <KpiTile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            tone={tile.tone}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          marginTop: "auto",
          fontFamily: "monospace",
          fontSize: 20,
          color: OG_COLORS.textTertiary,
          letterSpacing: "0.04em",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: OG_COLORS.brand,
            fontWeight: 700,
          }}
        >
          <StarMark size={18} color={OG_COLORS.brand} />
          <span>trendingrepo.com</span>
        </span>
        <span style={{ display: "flex" }}>share card</span>
      </div>

      <AccentStrip />
    </CardFrame>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "up" | "down";
}) {
  const valueColor =
    tone === "up"
      ? OG_COLORS.up
      : tone === "down"
        ? OG_COLORS.down
        : OG_COLORS.textPrimary;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 22px",
        borderRadius: 4,
        border: `1px solid ${OG_COLORS.border}`,
        backgroundColor: OG_COLORS.bgSecondary,
        minWidth: 200,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 13,
          fontFamily: "monospace",
          color: OG_COLORS.textTertiary,
          letterSpacing: "0.14em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 40,
          fontWeight: 800,
          color: valueColor,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function renderNotFound(fullName: string): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <NotFoundCard
        headline="Repo not found"
        subline="This repo isn't on the TrendingRepo radar yet."
        hint={fullName}
      />
      <AccentStrip />
    </div>
  );
}

interface RouteContext {
  params: Promise<{ owner: string; name: string }>;
}

export async function GET(
  _request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { owner, name } = await ctx.params;
  const fullName = `${owner}/${name}`;
  if (!SEGMENT.test(owner) || !SEGMENT.test(name)) {
    return new ImageResponse(renderNotFound(fullName), {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, s-maxage=60" },
    });
  }

  try {
    await refreshTrendingFromStore();
  } catch {
    /* graceful — derived-repos falls back to bundled JSON. */
  }

  const repo = (() => {
    try {
      return getDerivedRepoByFullName(fullName);
    } catch {
      return null;
    }
  })();

  if (!repo) {
    return new ImageResponse(renderNotFound(fullName), {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  }

  return new ImageResponse(renderRepoCard(repo), {
    width: WIDTH,
    height: HEIGHT,
    headers: OG_CACHE_HEADERS,
  });
}
