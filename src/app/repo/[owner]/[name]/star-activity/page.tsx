// TrendingRepo - single-repo Star Activity sub-route.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import {
  getStarActivity,
  refreshStarActivityFromStore,
} from "@/lib/star-activity";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildAbsoluteShareImageUrl } from "@/lib/star-activity-url";

import { StarActivityClient } from "./StarActivityClient";

export const dynamic = "force-dynamic";

const SLUG_PART = /^[A-Za-z0-9._-]+$/;

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

  const repo = getDerivedRepoByFullName(fullName);
  if (!repo) {
    notFound();
  }
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
