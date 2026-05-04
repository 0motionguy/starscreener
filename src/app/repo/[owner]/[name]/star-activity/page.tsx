// TrendingRepo - single-repo Star Activity sub-route.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { getRepoMetadata, refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import {
  getStarActivity,
  refreshStarActivityFromStore,
} from "@/lib/star-activity";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildAbsoluteShareImageUrl } from "@/lib/star-activity-url";
import type { Repo } from "@/lib/types";
import { slugToId } from "@/lib/utils";

import { StarActivityClient } from "./StarActivityClient";

export const dynamic = "force-dynamic";

const SLUG_PART = /^[A-Za-z0-9._-]+$/;

/**
 * Fallback Repo shape built from repo-metadata.json (or the URL params as a
 * last-resort skeleton) when the requested repo isn't in the derived-repos
 * cache. Lets the star-activity surface render for popular repos that the
 * trending pipeline doesn't currently track (e.g. vercel/next.js,
 * facebook/react). When star-activity payload data is also missing, the
 * chart layer falls back to per-repo sparkline (empty here) and the rest of
 * the page still serves a real 200 instead of a 404. Mirrors the shape of
 * `buildBaseRepoFromRecent` in src/lib/recent-repos.ts.
 */
function buildBaseRepoFromMetadata(fullName: string): Repo {
  const meta = getRepoMetadata(fullName);
  const [owner, name] = fullName.split("/");
  return {
    id: slugToId(fullName),
    fullName,
    name: meta?.name ?? name ?? fullName,
    owner: meta?.owner ?? owner ?? fullName,
    ownerAvatarUrl: meta?.ownerAvatarUrl ?? "",
    description: meta?.description ?? "",
    url: meta?.url ?? `https://github.com/${fullName}`,
    language: meta?.language ?? null,
    topics: meta?.topics ?? [],
    categoryId: "other",
    stars: meta?.stars ?? 0,
    forks: meta?.forks ?? 0,
    contributors: 0,
    openIssues: meta?.openIssues ?? 0,
    lastCommitAt:
      meta?.pushedAt ?? meta?.updatedAt ?? meta?.createdAt ?? "",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: meta?.createdAt ?? "",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    hasMovementData: false,
    starsDelta24hMissing: true,
    starsDelta7dMissing: true,
    starsDelta30dMissing: true,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
    trendScore24h: 0,
    trendScore7d: 0,
    trendScore30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
    tags: [],
  };
}

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, name } = await params;
  if (!SLUG_PART.test(owner) || !SLUG_PART.test(name)) {
    return {};
  }
  const fullName = `${owner}/${name}`;
  const canonical = absoluteUrl(`/repo/${owner}/${name}/star-activity`);
  const imageUrl = buildAbsoluteShareImageUrl({
    repos: [fullName],
    mode: "date",
    scale: "lin",
    legend: "tr",
    aspect: "h",
  });
  // Layout template at app/layout.tsx:65 appends ` — ${SITE_NAME}`. Drop the
  // manual suffix to avoid double-brand "rtk-ai/rtk - Star Activity -
  // TrendingRepo - TrendingRepo" which Google flags as low-quality.
  const title = `${fullName} - Star Activity`;
  const description = `Full-history star activity for ${fullName}. Compare against up to 3 other repos and share the chart.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 675,
          alt: `Star activity of ${fullName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function StarActivityPage({ params }: PageProps) {
  const { owner, name } = await params;
  if (!SLUG_PART.test(owner) || !SLUG_PART.test(name)) {
    notFound();
  }
  const fullName = `${owner}/${name}`;

  await Promise.all([
    refreshRepoMetadataFromStore(),
    refreshStarActivityFromStore(fullName),
  ]);

  // Try the trending-pipeline cache first; for popular repos that aren't
  // currently in the trending feeds (e.g. vercel/next.js, facebook/react),
  // fall back to the GitHub metadata bundle, and finally to a URL-only
  // skeleton so the surface always serves a 200 once the slug regex passes.
  // The chart layer renders an empty state when the star-activity payload
  // is also absent.
  const repo =
    getDerivedRepoByFullName(fullName) ?? buildBaseRepoFromMetadata(fullName);
  const payload = getStarActivity(fullName);
  const firstPoint = payload?.points[0] ?? null;
  const lastPoint = payload?.points[payload.points.length - 1] ?? null;
  const startStars = firstPoint?.s ?? 0;
  const currentStars = lastPoint?.s ?? repo.stars;
  const gainedStars = Math.max(0, currentStars - startStars);
  const peakDelta =
    payload?.points.reduce((max, point) => Math.max(max, point.delta), 0) ?? 0;

  return (
    <main className="home-surface repo-detail-page star-activity-page">
      <section className="id-strip">
        <div className="id-avatar">{repo.name.slice(0, 1).toLowerCase()}</div>
        <div className="id-meta">
          <div className="crumb">
            <Link href={`/repo/${owner}/${name}`}>{fullName}</Link>
            <span className="sep">/</span>
            <span className="firing">star activity</span>
          </div>
          <h1>
            <span className="owner">{repo.owner} /</span> {repo.name}
          </h1>
          {repo.description ? <p className="desc">{repo.description}</p> : null}
          <div className="row">
            {repo.language ? <span className="lang">{repo.language}</span> : null}
            <span className="stat">
              <span className="lbl">stars</span>
              {repo.stars.toLocaleString("en-US")}
            </span>
            <span className="stat">
              <span className="lbl">gained</span>
              +{gainedStars.toLocaleString("en-US")}
            </span>
          </div>
        </div>
        <div className="id-actions">
          <Link href={`/repo/${owner}/${name}`} className="btn">
            Repo detail
          </Link>
          <a href={repo.url} target="_blank" rel="noreferrer" className="btn gh">
            GitHub
          </a>
        </div>
      </section>

      <section className="repo-verdict">
        <div className="v-rank">
          <span className="lbl">Window</span>
          <span className="num">{payload?.points.length ?? 0}</span>
          <span className="sub">daily points</span>
        </div>
        <div className="v-score">
          <span className="lbl">Peak day</span>
          <span>
            <span className="big">+{peakDelta.toLocaleString("en-US")}</span>
          </span>
          <span className="meta">stars in one day</span>
        </div>
        <p className="v-text">
          <b>{fullName}</b> has added{" "}
          <span className="hl-money">+{gainedStars.toLocaleString("en-US")}</span>{" "}
          stars since {firstPoint?.d ?? "the first tracked point"}, with current
          momentum at <span className="hl">{repo.momentumScore.toFixed(2)}</span>.
        </p>
      </section>

      <StarActivityClient repo={repo} payload={payload} />
    </main>
  );
}
