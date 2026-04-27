// TrendingRepo — Collection detail OG share card.
//
// 1200×630 dynamic share card for /collections/[slug]. Renders the
// collection name, total member count, a live/hot/breakout summary, and
// the top 3 member repos (ranked by momentum against the live trending
// index). Falls back to a generic "collection not found" card if the slug
// is stale so social crawlers never see a 500.

import { ImageResponse } from "next/og";

import {
  loadCollection,
  indexReposByFullName,
  assembleCollectionRepos,
  summarizeCollection,
  isCuratedQuietStub,
} from "@/lib/collections";
import { getDerivedRepos } from "@/lib/derived-repos";
import { OG_COLORS } from "@/lib/seo";
import {
  CardFrame,
  NotFoundCard,
  StarMark,
  Wordmark,
  compactNumber,
  truncate,
} from "@/lib/og-primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "TrendingRepo — Collection card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SLUG_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const NAME_MAX = 64;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export default async function CollectionOGImage({ params }: RouteParams) {
  const { slug } = await params;
  const collection = SLUG_PATTERN.test(slug) ? loadCollection(slug) : null;

  if (!collection) {
    return new ImageResponse(
      (
        <NotFoundCard
          headline="Collection not found"
          subline="This curated list may have been renamed or removed."
          hint={`/collections/${slug}`}
        />
      ),
      size,
    );
  }

  // Resolve live members against the committed derived-repos JSON. Never
  // touches the mutable pipeline — same boundary as the homepage OG card.
  const live = indexReposByFullName(getDerivedRepos());
  const rows = assembleCollectionRepos(collection, live);
  const summary = summarizeCollection(collection, live);

  // Top 3 = first three rows sorted by momentum, excluding curated-quiet
  // stubs (stars=0, no live data).
  const top = rows.filter((r) => !isCuratedQuietStub(r)).slice(0, 3);
  const displayName = truncate(collection.name, NAME_MAX);

  return new ImageResponse(
    (
      <CardFrame>
        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: OG_COLORS.textTertiary,
            textTransform: "uppercase",
          }}
        >
          <span>Collection</span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 14px",
              borderRadius: 999,
              border: `1px solid ${OG_COLORS.border}`,
              backgroundColor: OG_COLORS.bgSecondary,
              color: OG_COLORS.textSecondary,
              fontSize: 18,
              letterSpacing: 1.2,
            }}
          >
            {summary.total} REPOS
          </div>
          {summary.breakoutCount > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 14px",
                borderRadius: 999,
                border: `1px solid ${OG_COLORS.brand}`,
                backgroundColor: OG_COLORS.brandDim,
                color: OG_COLORS.brand,
                fontSize: 18,
                letterSpacing: 1.2,
              }}
            >
              {summary.breakoutCount} BREAKOUT
            </div>
          )}
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: OG_COLORS.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {displayName}
        </div>

        {/* Sub-stats line */}
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 24,
            color: OG_COLORS.textSecondary,
            gap: 24,
          }}
        >
          <span>{summary.live} live now</span>
          <span style={{ color: OG_COLORS.textMuted }}>·</span>
          <span>{summary.hotCount} hot</span>
          <span style={{ color: OG_COLORS.textMuted }}>·</span>
          <span>{summary.breakoutCount} breaking out</span>
        </div>

        {/* Top 3 members */}
        {top.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 36,
              gap: 14,
              width: "100%",
            }}
          >
            {top.map((repo) => (
              <div
                key={repo.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 24px",
                  borderRadius: 14,
                  backgroundColor: OG_COLORS.bgSecondary,
                  border: `1px solid ${OG_COLORS.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    maxWidth: 760,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 28,
                      fontWeight: 700,
                      color: OG_COLORS.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {repo.fullName}
                  </div>
                  {repo.language && (
                    <div
                      style={{
                        display: "flex",
                        fontSize: 18,
                        color: OG_COLORS.textTertiary,
                        marginTop: 4,
                        fontFamily: "monospace",
                      }}
                    >
                      {repo.language}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 28,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    color: OG_COLORS.brand,
                  }}
                >
                  <span>{compactNumber(repo.stars)}</span>
                  <StarMark size={24} color={OG_COLORS.brand} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1 }} />
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            alignItems: "flex-end",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              color: OG_COLORS.textTertiary,
              letterSpacing: 0.5,
            }}
          >
            trendingrepo.com/collections/{collection.slug}
          </div>
          <Wordmark />
        </div>
      </CardFrame>
    ),
    size,
  );
}

