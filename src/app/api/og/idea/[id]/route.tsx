// GET /api/og/idea/[id] — Per-idea share card.
//
// Dynamic OG endpoint for the /ideas/[id] surface. Resolves the idea via
// the same loadDisplayIdea pattern the page uses (real ideas first, then
// the display-idea fallback that synthesises one from trending rows).
// Falls back to NotFoundCard when neither source resolves.
//
// Composition:
//   Header  — wordmark + route path
//   Hero    — idea title + pitch
//   Meta    — author handle, category, target repos (when present)
//   Footer  — domain + "share card"

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { getIdeaById, listIdeas, type IdeaRecord } from "@/lib/ideas";
import { getDisplayIdeaById } from "@/lib/ideas/display-data";
import {
  AccentStrip,
  CardFrame,
  NotFoundCard,
  StarMark,
  Wordmark,
  truncate,
} from "@/lib/og-primitives";
import { OG_CACHE_HEADERS, OG_COLORS } from "@/lib/seo";
import { getTrending } from "@/lib/trending";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

// Idea IDs are short slugs / UUIDs. Mirror a permissive but bounded
// pattern so the route rejects path-injection probes.
const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

async function loadIdea(id: string): Promise<IdeaRecord | null> {
  const real = await safeAsync(
    () => getIdeaById(id),
    null as Awaited<ReturnType<typeof getIdeaById>>,
  );
  if (
    real &&
    (real.status === "published" ||
      real.status === "shipped" ||
      real.status === "archived")
  ) {
    return real;
  }
  const all = await safeAsync(() => listIdeas(), [] as IdeaRecord[]);
  const rows = safe(() => getTrending("past_week", "All"), []);
  return getDisplayIdeaById(id, all, rows);
}

function renderIdeaCard(idea: IdeaRecord): ReactElement {
  const targets = idea.targetRepos.slice(0, 3);
  const tags = idea.tags.slice(0, 3);

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
          /ideas/{truncate(idea.id, 18)}
        </span>
      </div>

      {/* Category eyebrow */}
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontFamily: "monospace",
          fontSize: 14,
          color: OG_COLORS.brand,
          letterSpacing: "0.14em",
          fontWeight: 700,
        }}
      >
        {idea.category ? `// ${idea.category.toUpperCase()}` : "// IDEA"}
      </div>

      {/* Hero */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
        <span
          style={{
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
            maxWidth: 1056,
          }}
        >
          {truncate(idea.title, 64)}
        </span>
        <span
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 22,
            color: OG_COLORS.textSecondary,
            maxWidth: 1056,
            lineHeight: 1.4,
          }}
        >
          {truncate(idea.pitch, 220)}
        </span>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          marginTop: 28,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <MetaPill label="BY" value={`@${idea.authorHandle}`} accent />
        {targets.length > 0
          ? targets.map((t) => (
              <MetaPill key={t} label="REPO" value={truncate(t, 28)} />
            ))
          : null}
        {tags.map((t) => (
          <MetaPill key={`tag-${t}`} label="TAG" value={truncate(t, 18)} />
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

function MetaPill({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 4,
        border: `1px solid ${accent ? OG_COLORS.brand : OG_COLORS.border}`,
        backgroundColor: accent
          ? OG_COLORS.brandDim
          : OG_COLORS.bgSecondary,
        fontFamily: "monospace",
        fontSize: 18,
      }}
    >
      <span
        style={{
          display: "flex",
          color: accent ? OG_COLORS.brand : OG_COLORS.textTertiary,
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "flex",
          color: OG_COLORS.textPrimary,
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function renderNotFound(id: string): ReactElement {
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
        headline="Idea not found"
        subline="This idea is no longer published or hasn't been picked up yet."
        hint={id}
      />
      <AccentStrip />
    </div>
  );
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  ctx: RouteContext,
): Promise<Response> {
  const { id } = await ctx.params;
  if (!ID_PATTERN.test(id)) {
    return new ImageResponse(renderNotFound(id), {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, s-maxage=60" },
    });
  }

  const idea = await loadIdea(id);
  if (!idea) {
    return new ImageResponse(renderNotFound(id), {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  }

  return new ImageResponse(renderIdeaCard(idea), {
    width: WIDTH,
    height: HEIGHT,
    headers: OG_CACHE_HEADERS,
  });
}
