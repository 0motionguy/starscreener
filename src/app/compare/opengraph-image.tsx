// TrendingRepo — Compare page OG image
//
// 1200×630 share card for /compare?ids=a,b,c.
//
// CAVEAT: Next.js's file-based opengraph-image convention wraps our default
// export with a GET(_, ctx) handler that throws away the Request (see
// node_modules/next/dist/esm/build/webpack/loaders/next-metadata-route-loader.js).
// `headers()` is available but carries no query string — we confirmed this by
// dumping the live header set. That means we cannot reliably read ?ids= from
// inside this route. We try `referer` as a best-effort fallback (works when
// the preview fetch is triggered by a page that already has ids in its URL),
// then gracefully default to showing the top-2 trending repos so the card
// still previews the compare experience instead of looking empty.

import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import {
  getDerivedRepoById,
  getDerivedRepos,
} from "@/lib/derived-repos";
import { OG_COLORS } from "@/lib/seo";
import { StarMark } from "@/lib/og-primitives";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
export const alt = "TrendingRepo — Compare repos momentum card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MAX_CARDS = 4;
const MIN_CARDS_FOR_COMPARE = 2;

/**
 * Best-effort extraction of ids from the request. Next.js's metadata-route
 * wrapper does not forward the Request or searchParams to image handlers, so
 * we can only probe the headers AsyncLocalStorage exposes. `referer` tends
 * to be the only one that ever carries a query string (when a browser
 * previews a share URL). Returns an empty array when we can't find ids.
 */
async function readIdsFromRequest(): Promise<string[]> {
  const h = await headers();
  const candidates = [h.get("referer"), h.get("next-url")];
  const host = h.get("host") ?? "localhost";
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const url = new URL(raw, `http://${host}`);
      const ids = url.searchParams.get("ids");
      if (ids) return parseIds(ids);
    } catch {
      // fall through
    }
  }
  return [];
}

function parseIds(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_CARDS);
}

function resolveRepos(ids: string[]): Repo[] {
  const repos: Repo[] = [];
  for (const id of ids) {
    const repo = getDerivedRepoById(id);
    if (repo) repos.push(repo);
  }
  return repos;
}

export default async function CompareOGImage() {
  const requestedIds = await readIdsFromRequest();

  let repos = resolveRepos(requestedIds);
  let isFallback = false;

  // Fallback when the metadata wrapper didn't expose ids — surface the two
  // loudest movers today so the preview still demos the compare experience.
  if (repos.length < MIN_CARDS_FOR_COMPARE) {
    const all = getDerivedRepos();
    const movers = [...all]
      .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
      .slice(0, 2);
    if (movers.length >= MIN_CARDS_FOR_COMPARE) {
      repos = movers;
      isFallback = true;
    }
  }

  if (repos.length < MIN_CARDS_FOR_COMPARE) {
    return new ImageResponse(
      (
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
            fontFamily: "sans-serif",
            padding: "56px 72px",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 44,
              fontWeight: 800,
              color: OG_COLORS.brand,
            }}
          >
            <StarMark size={44} color={OG_COLORS.brand} />
            <span>TrendingRepo</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            Compare Repos
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 16,
              fontSize: 26,
              color: OG_COLORS.textTertiary,
              textAlign: "center",
              maxWidth: 880,
            }}
          >
            Side-by-side momentum, stars, and activity for up to 4 GitHub
            projects.
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 8,
              backgroundColor: OG_COLORS.brand,
              display: "flex",
            }}
          />
        </div>
      ),
      size,
    );
  }

  // Grid sizing: 2 cards → side-by-side wide; 3 cards → 3-up; 4 cards → 2x2.
  const n = repos.length;
  const cardWidth = n === 2 ? 500 : n === 3 ? 332 : 492;
  const cardHeight = n === 4 ? 188 : 356;
  const title = isFallback
    ? "Compare Repos · Trending"
    : `Comparing ${n} repo${n === 1 ? "" : "s"}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG_COLORS.bg,
          color: OG_COLORS.textPrimary,
          padding: "56px 72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Top row: wordmark + compare badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            <StarMark size={28} color={OG_COLORS.brand} />
            <span style={{ color: OG_COLORS.textPrimary }}>TrendingRepo</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 18px",
              borderRadius: 9999,
              border: `1px solid ${OG_COLORS.brand}`,
              color: OG_COLORS.brand,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontFamily: "monospace",
            }}
          >
            Compare
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 40,
            fontWeight: 700,
            color: OG_COLORS.textPrimary,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>

        {/* Cards grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 32,
            gap: 16,
            width: "100%",
          }}
        >
          {repos.map((r) => (
            <div
              key={r.id}
              style={{
                width: cardWidth,
                height: cardHeight,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderRadius: 14,
                backgroundColor: OG_COLORS.bgSecondary,
                border: `1px solid ${OG_COLORS.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: n === 3 ? 20 : 24,
                  fontWeight: 700,
                  color: OG_COLORS.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.01em",
                }}
              >
                {r.fullName}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <Stat
                  label="Stars"
                  value={formatStars(r.stars)}
                  color={OG_COLORS.textPrimary}
                />
                <Stat
                  label="24h"
                  value={`${r.starsDelta24h >= 0 ? "+" : ""}${formatCount(r.starsDelta24h)}`}
                  color={
                    r.starsDelta24h >= 0 ? OG_COLORS.up : OG_COLORS.down
                  }
                />
                <Stat
                  label="Momentum"
                  value={r.momentumScore.toFixed(1)}
                  color={OG_COLORS.brand}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer URL */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            fontSize: 18,
            fontFamily: "monospace",
            color: OG_COLORS.textTertiary,
            letterSpacing: 0.5,
          }}
        >
          <span>trendingrepo.com/compare</span>
          <span style={{ display: "flex", color: OG_COLORS.textMuted }}>
            {repos.map((r) => r.fullName).join(" · ")}
          </span>
        </div>

        {/* Accent strip */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            backgroundColor: OG_COLORS.brand,
            display: "flex",
          }}
        />
      </div>
    ),
    size,
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontFamily: "monospace",
      }}
    >
      <span
        style={{
          display: "flex",
          fontSize: 14,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: OG_COLORS.textTertiary,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "flex",
          fontSize: 22,
          fontWeight: 700,
          color,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatStars(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000).toLocaleString("en-US")}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
