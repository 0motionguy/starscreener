// /collections/[slug] — V4 W9 ProfileTemplate consumer.
//
// Migrated off the legacy TerminalLayout chrome to the V4 ProfileTemplate
// signature. The collection becomes the "entity" — identity strip with
// curator + topic chips, KpiBand summary, repo grid (RelatedRepoCard) as
// // 01, activity feed as // 02, curator + collection metadata in the
// right rail (// 03 About, // 04 Related collections).
//
// Mockup reference: repo-detail.html — same ProfileTemplate envelope used
// by /repo/[owner]/[name].

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { pipeline, repoStore } from "@/lib/pipeline/pipeline";
import {
  loadCollection,
  loadAllCollections,
  indexReposByFullName,
  assembleCollectionRepos,
  liveCountFor,
  summarizeCollection,
  isCuratedQuietStub,
  formatFreshness,
} from "@/lib/collections";
import {
  getCollectionRankingsFetchedAt,
  refreshCollectionRankingsFromStore,
} from "@/lib/collection-rankings";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";

export const revalidate = 600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = loadCollection(slug);
  const canonical = absoluteUrl(`/collections/${slug}`);
  if (!collection) {
    return {
      title: `Collection Not Found - ${SITE_NAME}`,
      description: "This collection does not exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${collection.name} - ${SITE_NAME}`;
  const description = `${collection.items.length} curated repos in ${collection.name}, ranked live against current trending data on ${SITE_NAME}.`;
  return {
    title,
    description,
    keywords: [
      collection.name,
      "AI",
      "GitHub",
      "curated",
      "open source",
      "momentum",
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

const CURATOR_NAME = "OSS Insight";
const CURATOR_URL = "https://github.com/pingcap/ossinsight";

export default async function CollectionDetailPage({ params }: PageProps) {
  await pipeline.ensureReady();
  await refreshCollectionRankingsFromStore();
  const { slug } = await params;
  const collection = loadCollection(slug);
  if (!collection) notFound();

  const liveIndex = indexReposByFullName(repoStore.getAll());
  const repos = assembleCollectionRepos(collection, liveIndex);
  const live = liveCountFor(collection, liveIndex);
  const summary = summarizeCollection(collection, liveIndex);
  const rankingsFreshness = formatFreshness(getCollectionRankingsFetchedAt());

  // Aggregate stats over the live (non-stub) members.
  const liveRepos = repos.filter((r) => !isCuratedQuietStub(r));
  const combinedStars = liveRepos.reduce((acc, r) => acc + r.stars, 0);
  const languageSet = new Set<string>();
  for (const r of liveRepos) {
    if (r.language) languageSet.add(r.language);
  }
  const languageCount = languageSet.size;

  // Most-active in 7d window — top repo by 7d star delta among live members.
  const mostActive7d = [...liveRepos]
    .filter((r) => !r.starsDelta7dMissing && r.starsDelta7d > 0)
    .sort((a, b) => b.starsDelta7d - a.starsDelta7d)[0];

  // Topic chips — most-frequent topics across live repos, top 5.
  const topicChips = collectTopTopics(liveRepos, 5);

  // Activity feed — recent star moves across collection members.
  const activity = buildActivityFeed(liveRepos, 8);

  // Related collections — siblings sharing the most repo overlap.
  const relatedCollections = buildRelatedCollections(collection, 5);

  // Verdict tone derived from movement counts.
  const moving = summary.breakoutCount + summary.hotCount;
  const verdictTone =
    summary.breakoutCount > 0
      ? "money"
      : moving > 0
        ? "acc"
        : "amber";

  return (
    <main className="home-surface collection-detail-page">
      <ProfileTemplate
        crumb={
          <>
            <b>COLLECTION</b> · TERMINAL · /COLLECTIONS/{slug.toUpperCase()}
          </>
        }
        identity={
          <CollectionIdentity
            name={collection.name}
            curator={CURATOR_NAME}
            curatorHref={CURATOR_URL}
            topics={topicChips}
            total={collection.items.length}
            live={live}
            slug={slug}
          />
        }
        clock={
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v4-ink-300)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            rankings · {rankingsFreshness}
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// COLLECTION",
              headline: `${live} / ${collection.items.length} live`,
              sub: `${summary.breakoutCount} breakout · ${summary.hotCount} hot`,
            }}
            text={
              <>
                <b>{collection.name}</b> tracks{" "}
                <span style={{ color: "var(--v4-ink-100)" }}>
                  {collection.items.length}
                </span>{" "}
                curated repos.{" "}
                {summary.breakoutCount > 0 ? (
                  <>
                    <span style={{ color: "var(--v4-money)" }}>
                      {summary.breakoutCount} breaking out
                    </span>{" "}
                    right now,{" "}
                  </>
                ) : null}
                <span style={{ color: "var(--v4-acc)" }}>{moving} moving</span>{" "}
                across the live cohort.
              </>
            }
            actionHref="/collections"
            actionLabel="ALL COLLECTIONS →"
          />
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: "Repos",
                value: formatNumber(collection.items.length),
                sub: `${live} with live data`,
              },
              {
                label: "Combined stars",
                value: formatNumber(combinedStars),
                sub: "live members",
                tone: "money",
              },
              {
                label: "Languages",
                value: formatNumber(languageCount),
                sub: languageCount > 0 ? "distinct" : "no data",
              },
              {
                label: "Most-active 7d",
                value: mostActive7d
                  ? `+${formatNumber(mostActive7d.starsDelta7d)}`
                  : "—",
                sub: mostActive7d ? mostActive7d.fullName : "no movement",
                tone: mostActive7d ? "money" : "default",
              },
              {
                label: "Curator",
                value: CURATOR_NAME,
                sub: "Apache 2.0",
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead
              num="// 01"
              title="Repos"
              meta={`${repos.length} CURATED · ${live} LIVE`}
            />
            {repos.length > 0 ? (
              <div className="v4-profile-template__related">
                {repos.map((repo) => {
                  const quiet = isCuratedQuietStub(repo);
                  const [owner, name] = repo.fullName.split("/");
                  const href =
                    owner && name ? `/repo/${owner}/${name}` : undefined;
                  return (
                    <RelatedRepoCard
                      key={repo.fullName}
                      fullName={repo.fullName}
                      description={
                        repo.description?.trim() ||
                        (quiet ? "No live data yet." : undefined)
                      }
                      language={
                        repo.language ? repo.language.toUpperCase() : undefined
                      }
                      stars={quiet ? "—" : formatNumber(repo.stars)}
                      similarity={
                        quiet
                          ? "CURATED"
                          : repo.movementStatus
                            ? repo.movementStatus.toUpperCase()
                            : undefined
                      }
                      href={href}
                    />
                  );
                })}
              </div>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "12px 0",
                }}
              >
                No repos in this collection yet.
              </p>
            )}

            <SectionHead
              num="// 02"
              title="Activity feed"
              meta={`${activity.length} RECENT · 7D`}
            />
            {activity.length > 0 ? (
              <ul className="v4-collection-activity">
                {activity.map((row) => (
                  <li key={row.fullName} className="v4-collection-activity__row">
                    <span className="v4-collection-activity__name">
                      <Link
                        href={`/repo/${row.fullName.split("/")[0]}/${row.fullName.split("/")[1]}`}
                      >
                        {row.fullName}
                      </Link>
                    </span>
                    <span className="v4-collection-activity__delta">
                      {row.delta > 0 ? "+" : ""}
                      {formatNumber(row.delta)} stars · 7d
                    </span>
                    <span className="v4-collection-activity__status">
                      {row.status.toUpperCase()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "12px 0",
                }}
              >
                No 7d movement across this collection yet.
              </p>
            )}
          </>
        }
        rightRail={
          <>
            <SectionHead num="// 03" title="About" as="h3" />
            <div className="v4-collection-rail-card">
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Curator</span>
                <a
                  className="v4-collection-rail-card__value"
                  href={CURATOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {CURATOR_NAME} ↗
                </a>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">License</span>
                <span className="v4-collection-rail-card__value">
                  Apache 2.0
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Source</span>
                <span className="v4-collection-rail-card__value">
                  data/collections/{collection.slug}.yml
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Upstream id</span>
                <span className="v4-collection-rail-card__value">
                  #{collection.id}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Rankings</span>
                <span className="v4-collection-rail-card__value">
                  {rankingsFreshness}
                </span>
              </div>
            </div>

            <SectionHead num="// 04" title="Related collections" as="h3" />
            {relatedCollections.length > 0 ? (
              <ul className="v4-collection-rail-list">
                {relatedCollections.map((c) => (
                  <li
                    key={c.slug}
                    className="v4-collection-rail-list__item"
                  >
                    <Link
                      href={`/collections/${c.slug}`}
                      className="v4-collection-rail-list__link"
                    >
                      <span>{c.name}</span>
                      <span className="v4-collection-rail-list__count">
                        {c.total}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-300)",
                  padding: "8px 0",
                }}
              >
                No related collections.
              </p>
            )}
          </>
        }
      />
    </main>
  );
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return loadAllCollections().map((c) => ({ slug: c.slug }));
}

// --- Composition helpers --------------------------------------------------

interface CollectionIdentityProps {
  name: string;
  curator: string;
  curatorHref: string;
  topics: string[];
  total: number;
  live: number;
  slug: string;
}

function CollectionIdentity({
  name,
  curator,
  curatorHref,
  topics,
  total,
  live,
  slug,
}: CollectionIdentityProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        marginTop: 8,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 4,
          background: "var(--v4-bg-100)",
          border: "1px solid var(--v4-line-200)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 22,
          color: "var(--v4-ink-200)",
          flexShrink: 0,
          textTransform: "uppercase",
        }}
      >
        {slug.slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          {name}
        </h1>
        <p
          className="v4-page-head__lede"
          style={{ marginTop: 0, marginBottom: 10 }}
        >
          Curated by{" "}
          <a
            href={curatorHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--v4-acc)" }}
          >
            {curator}
          </a>
          , ranked live against the current TrendingRepo terminal index.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-300)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {topics.map((topic) => (
            <span
              key={topic}
              style={{
                padding: "1px 6px",
                border: "1px solid var(--v4-line-200)",
                borderRadius: 2,
                color: "var(--v4-ink-300)",
              }}
            >
              {topic}
            </span>
          ))}
          <span>
            REPOS{" "}
            <b style={{ color: "var(--v4-ink-100)" }}>{formatNumber(total)}</b>
          </span>
          <span style={{ color: "var(--v4-money)" }}>
            ● {formatNumber(live)} LIVE
          </span>
        </div>
      </div>
    </div>
  );
}

function collectTopTopics(repos: Repo[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    for (const topic of repo.topics ?? []) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic);
}

interface ActivityRow {
  fullName: string;
  delta: number;
  status: string;
}

function buildActivityFeed(repos: Repo[], limit: number): ActivityRow[] {
  return repos
    .filter((r) => !r.starsDelta7dMissing && r.starsDelta7d !== 0)
    .map((r) => ({
      fullName: r.fullName,
      delta: r.starsDelta7d,
      status: r.movementStatus,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

interface RelatedCollection {
  slug: string;
  name: string;
  total: number;
  overlap: number;
}

function buildRelatedCollections(
  current: ReturnType<typeof loadCollection>,
  limit: number,
): RelatedCollection[] {
  if (!current) return [];
  const all = loadAllCollections();
  const currentItems = new Set(current.items.map((i) => i.toLowerCase()));
  const scored: RelatedCollection[] = [];
  for (const other of all) {
    if (other.slug === current.slug) continue;
    let overlap = 0;
    for (const item of other.items) {
      if (currentItems.has(item.toLowerCase())) overlap += 1;
    }
    scored.push({
      slug: other.slug,
      name: other.name,
      total: other.items.length,
      overlap,
    });
  }
  // Prefer overlap, then larger sibling collections, then alphabetical.
  scored.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      b.total - a.total ||
      a.name.localeCompare(b.name),
  );
  return scored.slice(0, limit);
}
