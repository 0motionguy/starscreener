// GET /api/og/tier-list — Tier List share card renderer.
//
// Two ways to seed the card:
//   ?id=<shortId>            — looks up the persisted payload from Redis.
//   ?state=<base64-json>     — renders an unsaved draft (URL-state-only).
//
// Aspects:
//   ?aspect=h   1200×675     X / Twitter (default)
//   ?aspect=v   1080×1350    IG / mobile vertical
//   ?aspect=yt  1280×720     YouTube thumbnail
//
// Avatars resolve from `Repo.ownerAvatarUrl` when the repo is in our derived
// set; missing repos fall back to a 2-letter monogram on brand orange.

import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  AccentStrip,
  CardFrame,
  StarMark,
} from "@/lib/og-primitives";
import { OG_COLORS, SITE_URL } from "@/lib/seo";
import {
  MAX_ITEMS_PER_TIER,
} from "@/lib/tier-list/constants";
import { tierListPayloadSchema } from "@/lib/tier-list/schema";
import { isShortId } from "@/lib/tier-list/short-id";
import { getTierList } from "@/lib/tier-list/store";
import type { TierListPayload, TierRow } from "@/lib/types/tier-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Aspect = "h" | "v" | "yt";

interface SizeSpec {
  width: number;
  height: number;
  /** Avatar diameter inside an item cell. */
  avatar: number;
  /** Cell width including label gutter. */
  cellWidth: number;
  /** Tier-row height (label swatch + items strip). */
  rowHeight: number;
  /** Visible items per row before showing "+N". */
  itemsPerRow: number;
  /** Title font size. */
  titleSize: number;
  /** Subtitle font size. */
  subtitleSize: number;
  /** Header strip + footer mono size. */
  metaSize: number;
}

const SIZES: Record<Aspect, SizeSpec> = {
  h: {
    width: 1200,
    height: 675,
    avatar: 48,
    cellWidth: 96,
    rowHeight: 70,
    itemsPerRow: 10,
    titleSize: 56,
    subtitleSize: 22,
    metaSize: 18,
  },
  yt: {
    width: 1280,
    height: 720,
    avatar: 52,
    cellWidth: 100,
    rowHeight: 74,
    itemsPerRow: 10,
    titleSize: 60,
    subtitleSize: 24,
    metaSize: 18,
  },
  v: {
    width: 1080,
    height: 1350,
    avatar: 52,
    cellWidth: 96,
    rowHeight: 130,
    itemsPerRow: 7,
    titleSize: 56,
    subtitleSize: 22,
    metaSize: 18,
  },
};

function parseAspect(raw: string | null): Aspect {
  if (raw === "v" || raw === "yt") return raw;
  return "h";
}

function loadStateFromQuery(stateRaw: string | null): TierListPayload | null {
  if (!stateRaw) return null;
  try {
    const json = Buffer.from(stateRaw, "base64").toString("utf8");
    const parsed = tierListPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const aspect = parseAspect(url.searchParams.get("aspect"));
  const size = SIZES[aspect];

  const idParam = url.searchParams.get("id");
  let payload: TierListPayload | null = null;
  if (idParam && isShortId(idParam)) {
    payload = await getTierList(idParam);
  }
  if (!payload) {
    payload = loadStateFromQuery(url.searchParams.get("state"));
  }

  const card = payload
    ? renderTierListCard(payload, size)
    : renderFallbackCard(size, aspect);

  return new ImageResponse(card, {
    width: size.width,
    height: size.height,
    headers: {
      "Cache-Control":
        "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}

// ---------------------------------------------------------------------------
// Card composition
// ---------------------------------------------------------------------------

function renderTierListCard(
  payload: TierListPayload,
  size: SizeSpec,
): ReactElement {
  const date = (payload.updatedAt || payload.createdAt || new Date().toISOString()).slice(
    0,
    10,
  );
  const itemCount =
    payload.unrankedItems.length +
    payload.tiers.reduce((sum, tier) => sum + tier.items.length, 0);
  const subtitle = payload.ownerHandle
    ? `Created by @${payload.ownerHandle} · ${itemCount} items`
    : `${itemCount} items`;

  const padding =
    size.width >= 1200 ? "40px 56px 56px 56px" : "32px 40px 56px 40px";

  return (
    <CardFrame padding={padding}>
      <HeaderStrip date={date} fontSize={size.metaSize} />
      <Title text={payload.title} fontSize={size.titleSize} />
      <Subtitle text={subtitle} fontSize={size.subtitleSize} />
      <Grid tiers={payload.tiers} size={size} />
      <Footer
        shortId={payload.shortId}
        handle={payload.ownerHandle}
        fontSize={size.metaSize}
      />
    </CardFrame>
  );
}

function renderFallbackCard(size: SizeSpec, aspect: Aspect): ReactElement {
  const padding =
    size.width >= 1200 ? "40px 56px 56px 56px" : "32px 40px 56px 40px";
  return (
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
        padding,
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
        Tier list not found
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 12,
          fontSize: 22,
          color: OG_COLORS.textTertiary,
          fontFamily: "monospace",
        }}
      >
        {`aspect=${aspect} · ${size.width}×${size.height}`}
      </div>
      <AccentStrip />
    </div>
  );
}

function HeaderStrip({
  date,
  fontSize,
}: {
  date: string;
  fontSize: number;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        color: OG_COLORS.textTertiary,
        fontFamily: "monospace",
        fontSize,
        letterSpacing: "0.04em",
      }}
    >
      <span>{"// 01 · TIER LIST"}</span>
      <span>{date}</span>
    </div>
  );
}

function Title({
  text,
  fontSize,
}: {
  text: string;
  fontSize: number;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        marginTop: 16,
        fontSize,
        fontWeight: 800,
        color: OG_COLORS.textPrimary,
        lineHeight: 1.05,
      }}
    >
      {truncate(text, 64)}
    </div>
  );
}

function Subtitle({
  text,
  fontSize,
}: {
  text: string;
  fontSize: number;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        marginTop: 8,
        fontSize,
        color: OG_COLORS.textSecondary,
        fontFamily: "monospace",
      }}
    >
      {truncate(text, 90)}
    </div>
  );
}

function Grid({
  tiers,
  size,
}: {
  tiers: TierRow[];
  size: SizeSpec;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: 24,
        flexGrow: 1,
        border: `1px solid ${OG_COLORS.border}`,
      }}
    >
      {tiers.map((tier, index) => (
        <Row
          key={tier.id}
          tier={tier}
          size={size}
          isLast={index === tiers.length - 1}
        />
      ))}
    </div>
  );
}

function Row({
  tier,
  size,
  isLast,
}: {
  tier: TierRow;
  size: SizeSpec;
  isLast: boolean;
}): ReactElement {
  const visible = tier.items.slice(0, size.itemsPerRow);
  const overflow = tier.items.length - visible.length;
  const swatchSize = size.rowHeight - 12;
  return (
    <div
      style={{
        display: "flex",
        height: size.rowHeight,
        borderBottom: isLast ? "none" : `1px solid ${OG_COLORS.border}`,
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: swatchSize,
          backgroundColor: tier.color,
          color: "#0a0a0a",
          fontFamily: "monospace",
          fontWeight: 800,
          fontSize: Math.round(swatchSize * 0.45),
          flexShrink: 0,
          margin: 6,
          borderRadius: 4,
        }}
      >
        {tier.label.slice(0, 3).toUpperCase()}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexGrow: 1,
          paddingLeft: 12,
          gap: 8,
          overflow: "hidden",
        }}
      >
        {visible.map((repoId) => (
          <Cell key={repoId} repoId={repoId} size={size} />
        ))}
        {overflow > 0 ? <OverflowChip count={overflow} size={size} /> : null}
      </div>
    </div>
  );
}

function Cell({
  repoId,
  size,
}: {
  repoId: string;
  size: SizeSpec;
}): ReactElement {
  const repo = getDerivedRepoByFullName(repoId);
  const avatarUrl = repo?.ownerAvatarUrl;
  const labelText = repo?.name ?? repoId.split("/").pop() ?? repoId;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: size.cellWidth,
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          width={size.avatar}
          height={size.avatar}
          style={{
            width: size.avatar,
            height: size.avatar,
            borderRadius: 8,
            objectFit: "cover",
          }}
        />
      ) : (
        <Monogram repoId={repoId} size={size.avatar} />
      )}
      <div
        style={{
          display: "flex",
          marginTop: 4,
          fontFamily: "monospace",
          fontSize: 11,
          color: OG_COLORS.textSecondary,
          maxWidth: size.cellWidth - 4,
          overflow: "hidden",
        }}
      >
        {truncate(labelText, 14)}
      </div>
    </div>
  );
}

function Monogram({
  repoId,
  size,
}: {
  repoId: string;
  size: number;
}): ReactElement {
  const [owner = "", name = ""] = repoId.split("/");
  const monogram =
    `${(owner[0] ?? "?")}${(name[0] ?? "?")}`.toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 8,
        backgroundColor: OG_COLORS.brand,
        color: "#0a0a0a",
        fontFamily: "monospace",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {monogram}
    </div>
  );
}

function OverflowChip({
  count,
  size,
}: {
  count: number;
  size: SizeSpec;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size.avatar,
        height: size.avatar,
        borderRadius: 8,
        backgroundColor: OG_COLORS.bgTertiary,
        color: OG_COLORS.textSecondary,
        fontFamily: "monospace",
        fontWeight: 700,
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      +{Math.min(count, 99)}
    </div>
  );
}

function Footer({
  shortId,
  handle,
  fontSize,
}: {
  shortId: string;
  handle: string | null;
  fontSize: number;
}): ReactElement {
  const url = `${stripProtocol(SITE_URL)}/tierlist/${shortId}`;
  const author = handle ? `made by @${handle}` : "made anonymously";
  return (
    <div
      style={{
        display: "flex",
        marginTop: 16,
        alignItems: "center",
        justifyContent: "space-between",
        color: OG_COLORS.textTertiary,
        fontFamily: "monospace",
        fontSize,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: OG_COLORS.brand,
          fontWeight: 700,
        }}
      >
        <StarMark size={fontSize} color={OG_COLORS.brand} />
        <span>TrendingRepo</span>
        <span style={{ color: OG_COLORS.textTertiary, fontWeight: 400 }}>
          · {url}
        </span>
      </div>
      <span>{author}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "…";
  return text.slice(0, max - 1).trimEnd() + "…";
}

function stripProtocol(href: string): string {
  return href.replace(/^https?:\/\//, "");
}

// `MAX_ITEMS_PER_TIER` import is the canonical cap; expose locally so callers
// can import this module to get the renderer's idea of "row is full". Keeps
// the constant single-sourced from the schema.
export const OG_TIER_LIST_MAX_ITEMS_PER_TIER = MAX_ITEMS_PER_TIER;
