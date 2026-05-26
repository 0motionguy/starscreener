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
import { OG_COLORS } from "@/lib/seo";
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
  /** Avatar square edge inside the chip. */
  avatar: number;
  /** Chip max width — name truncates if it exceeds this. */
  chipWidth: number;
  /** Chip height — fills the row with 6px padding above/below. */
  chipHeight: number;
  /** Tier-row height (swatch + chips strip). */
  rowHeight: number;
  /** Width of the colored tier-letter swatch on the left. */
  swatchWidth: number;
  /** Visible items per row before showing "+N". */
  itemsPerRow: number;
  /** Header strip + footer mono size. */
  metaSize: number;
  /** Chip repo-name font size. */
  nameSize: number;
  /** Chip stars font size. */
  starSize: number;
}

const SIZES: Record<Aspect, SizeSpec> = {
  h: {
    // 1200×630 is the documented Twitter `summary_large_image` aspect
    // (true 2:1). 1200×675 (16:9) silently center-crops on the X
    // renderer and clipped the F row + footer.
    width: 1200,
    height: 630,
    avatar: 44,
    chipWidth: 232,
    chipHeight: 56,
    rowHeight: 66,
    swatchWidth: 84,
    itemsPerRow: 4,
    metaSize: 17,
    nameSize: 15,
    starSize: 12,
  },
  yt: {
    width: 1280,
    height: 720,
    avatar: 52,
    chipWidth: 256,
    chipHeight: 64,
    rowHeight: 76,
    swatchWidth: 92,
    itemsPerRow: 4,
    metaSize: 18,
    nameSize: 16,
    starSize: 13,
  },
  v: {
    width: 1080,
    height: 1350,
    avatar: 68,
    chipWidth: 290,
    chipHeight: 84,
    rowHeight: 158,
    swatchWidth: 148,
    itemsPerRow: 3,
    metaSize: 22,
    nameSize: 18,
    starSize: 15,
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
    size.height >= 1100
      ? "32px 56px 32px 56px"
      : "24px 48px 28px 48px";

  return (
    <CardFrame padding={padding}>
      <Hero
        date={date}
        subtitle={subtitle}
        size={size}
      />
      <Grid tiers={payload.tiers} size={size} />
      <Footer
        handle={payload.ownerHandle}
        fontSize={size.metaSize}
      />
    </CardFrame>
  );
}

function renderFallbackCard(size: SizeSpec, aspect: Aspect): ReactElement {
  const padding =
    size.height >= 1100
      ? "32px 56px 32px 56px"
      : "24px 48px 28px 48px";
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

function Hero({
  date,
  subtitle,
  size,
}: {
  date: string;
  subtitle: string;
  size: SizeSpec;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 12,
        marginBottom: 12,
        borderBottom: `1px solid ${OG_COLORS.border}`,
        fontFamily: "monospace",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 11px 5px 9px",
            backgroundColor: "rgba(245, 110, 15, 0.14)",
            border: `1px solid ${OG_COLORS.brand}`,
            borderRadius: 4,
            color: OG_COLORS.brand,
            fontSize: size.metaSize,
            fontWeight: 800,
            letterSpacing: "0.14em",
          }}
        >
          <StarMark size={size.metaSize - 2} color={OG_COLORS.brand} />
          <span style={{ display: "flex" }}>TIER LIST</span>
        </div>
        <div
          style={{
            display: "flex",
            color: OG_COLORS.textSecondary,
            fontSize: size.metaSize,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {truncate(subtitle, 30).toUpperCase()}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          color: OG_COLORS.textTertiary,
          fontSize: size.metaSize,
          letterSpacing: "0.06em",
        }}
      >
        {date}
      </div>
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
  return (
    <div
      style={{
        display: "flex",
        height: size.rowHeight,
        borderBottom: isLast ? "none" : `1px solid ${OG_COLORS.border}`,
        alignItems: "stretch",
      }}
    >
      {/* Tier letter: edge-to-edge, full row height, no margin, no radius.
          Matches the in-app .tier-letter exactly. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size.swatchWidth,
          backgroundColor: tier.color,
          color: "#0a0a0a",
          fontFamily: "sans-serif",
          fontWeight: 900,
          fontSize: Math.round(size.rowHeight * 0.46),
          flexShrink: 0,
          letterSpacing: "-0.04em",
        }}
      >
        {tier.label.slice(0, 3).toUpperCase()}
      </div>
      {/* Chip strip — bg matches the in-app tier-drop background */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexGrow: 1,
          paddingLeft: 12,
          paddingRight: 12,
          gap: 10,
          overflow: "hidden",
          backgroundColor: OG_COLORS.bg,
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

/**
 * Horizontal chip — matches the in-app .tier-item layout exactly:
 * avatar on the left, owner/repo name in mono on the right, optional
 * orange star count after a hairline divider.
 *
 * Avatar source URL is upscaled via `?s=<2x display size>` for GitHub
 * avatars (they respect the size param). Without this, satori downsamples
 * a 460px default to ~52px and the result is blurry.
 */
function Cell({
  repoId,
  size,
}: {
  repoId: string;
  size: SizeSpec;
}): ReactElement {
  const repo = getDerivedRepoByFullName(repoId);
  const rawAvatarUrl = repo?.ownerAvatarUrl;
  const avatarUrl = rawAvatarUrl
    ? withGithubAvatarSize(rawAvatarUrl, size.avatar * 2)
    : undefined;
  const stars = repo?.stars ?? 0;
  // Truncate the repo name so the chip fits within chipWidth. Each mono
  // char ≈ 0.55 × font-size. Reserve space for avatar + gap + star block.
  const reservedForStars = stars > 0 ? size.starSize * 4 + 18 : 0;
  const textBudget =
    size.chipWidth - size.avatar - 18 - 14 - reservedForStars;
  const maxChars = Math.max(6, Math.floor(textBudget / (size.nameSize * 0.55)));
  const repoName = repo?.name ?? repoId.split("/")[1] ?? repoId;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: size.chipHeight,
        maxWidth: size.chipWidth,
        paddingLeft: 6,
        paddingRight: 12,
        backgroundColor: OG_COLORS.bgSecondary,
        border: `1px solid ${OG_COLORS.border}`,
        borderRadius: 4,
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
            borderRadius: 4,
            objectFit: "cover",
          }}
        />
      ) : (
        <Monogram repoId={repoId} size={size.avatar} />
      )}
      <div
        style={{
          display: "flex",
          fontFamily: "monospace",
          fontSize: size.nameSize,
          fontWeight: 600,
          color: OG_COLORS.textPrimary,
          letterSpacing: "-0.005em",
          overflow: "hidden",
        }}
      >
        {truncate(repoName, maxChars)}
      </div>
      {stars > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingLeft: 10,
            marginLeft: "auto",
            borderLeft: `1px solid ${OG_COLORS.border}`,
            height: size.avatar - 8,
            fontFamily: "monospace",
            fontSize: size.starSize,
            fontWeight: 700,
            color: OG_COLORS.brand,
            letterSpacing: "0.02em",
          }}
        >
          <span style={{ display: "flex" }}>{compactStars(stars)}</span>
        </div>
      ) : null}
    </div>
  );
}

function compactStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * GitHub avatar URLs (`https://avatars.githubusercontent.com/u/123?v=4`)
 * accept a `s` query param for server-side resize. Setting it to 2x the
 * display size gives a retina-crisp source and keeps the PNG payload small.
 * Non-GitHub URLs are returned unchanged.
 */
function withGithubAvatarSize(url: string, size: number): string {
  if (!url.includes("avatars.githubusercontent.com")) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("s", String(size));
    return parsed.toString();
  } catch {
    return url;
  }
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
        borderRadius: 4,
        backgroundColor: OG_COLORS.brand,
        color: "#0a0a0a",
        fontFamily: "monospace",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
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
        height: size.chipHeight,
        minWidth: size.chipHeight,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 4,
        backgroundColor: OG_COLORS.bgSecondary,
        border: `1px solid ${OG_COLORS.border}`,
        color: OG_COLORS.brand,
        fontFamily: "monospace",
        fontWeight: 700,
        fontSize: size.nameSize,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      +{Math.min(count, 99)}
    </div>
  );
}

function Footer({
  handle,
  fontSize,
}: {
  handle: string | null;
  fontSize: number;
}): ReactElement {
  const author = handle
    ? `MADE BY @${handle.toUpperCase()}`
    : "BUILD YOURS";
  return (
    <div
      style={{
        display: "flex",
        marginTop: 12,
        paddingTop: 12,
        borderTop: `1px solid ${OG_COLORS.border}`,
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "monospace",
        fontSize,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: OG_COLORS.brand,
          fontWeight: 800,
          letterSpacing: "-0.005em",
        }}
      >
        <StarMark size={fontSize + 4} color={OG_COLORS.brand} />
        <span
          style={{
            display: "flex",
            fontSize: fontSize + 1,
            letterSpacing: "-0.01em",
          }}
        >
          trendingrepo.com
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            display: "flex",
            color: OG_COLORS.textTertiary,
            letterSpacing: "0.08em",
          }}
        >
          {author}
        </span>
        <span
          style={{
            display: "flex",
            padding: "5px 11px",
            backgroundColor: OG_COLORS.brand,
            color: "#0a0a0a",
            fontWeight: 800,
            fontSize: fontSize - 2,
            letterSpacing: "0.12em",
            borderRadius: 3,
          }}
        >
          /TOOLS/TIER-LIST
        </span>
      </div>
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

