// /categories/[slug] — V4 ProfileTemplate consumer.
//
// Migrated off the legacy TerminalLayout chrome to the V4 ProfileTemplate
// signature (per master plan §312, same envelope used by /collections/[slug]
// and /repo/[owner]/[name]). The category becomes the "entity" — identity
// strip with category title + repo count + topic chips, KpiBand summary,
// repo grid (RelatedRepoCard) as // 01, About card + Related categories in
// the right rail.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getDerivedCategoryStats } from "@/lib/derived-insights";
import {
  loadCategoryMetricsPrev1d,
  loadCategoryMetricsPrev7d,
  loadCategoryMetricsPrev30d,
} from "@/lib/ecosystem-leaderboards";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";

export const revalidate = 1800;

// W5-CATWINDOW — supported tracking windows for the per-category tabs.
// Default 7d on first paint; URL `?window=24h | 7d | 30d` controls active.
const TRACK_WINDOWS = ["24h", "7d", "30d"] as const;
type TrackWindow = (typeof TRACK_WINDOWS)[number];

const TRACK_LABEL: Record<TrackWindow, string> = {
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
};

function parseTrackWindow(value: string | string[] | undefined): TrackWindow {
  const v = Array.isArray(value) ? value[0] : value;
  return TRACK_WINDOWS.includes(v as TrackWindow) ? (v as TrackWindow) : "7d";
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ window?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  const canonical = absoluteUrl(`/categories/${slug}`);
  if (!category) {
    return {
      title: `Category Not Found - ${SITE_NAME}`,
      description: "This category does not exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${category.name} - ${SITE_NAME}`;
  const description = `${category.description}. Live momentum ranks for every ${category.shortName} repo on ${SITE_NAME}.`;
  return {
    title,
    description,
    keywords: [
      category.name,
      category.shortName,
      "GitHub category",
      "open source",
      "repo momentum",
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

export default async function CategoryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  if (!category) notFound();

  const sp = (await searchParams) ?? {};
  const trackWindow = parseTrackWindow(sp.window);

  // W5-CATWINDOW — pull the matching window's prev-snapshot Map. Empty
  // during cold-start; we render the tab as `—` then.
  const prevByWindowLoader: Record<
    TrackWindow,
    () => Promise<Map<string, number>>
  > = {
    "24h": loadCategoryMetricsPrev1d,
    "7d": loadCategoryMetricsPrev7d,
    "30d": loadCategoryMetricsPrev30d,
  };
  const prevWindowMap = await prevByWindowLoader[trackWindow]();

  const repos = getDerivedRepos().filter((r) => r.categoryId === slug);

  // Aggregates for the KPI band.
  const totalStars = repos.reduce((sum, r) => sum + r.stars, 0);
  const languageSet = new Set<string>();
  for (const r of repos) {
    if (r.language) languageSet.add(r.language);
  }
  const languageCount = languageSet.size;

  // W5-CATWINDOW — sector-level windowed star delta. Subtract this
  // category's prev-window total from the current totalStars. `null`
  // during cold-start (snapshot key not warmed yet).
  const prevWindowStars = prevWindowMap.get(slug);
  const sectorWindowDelta =
    prevWindowStars !== undefined && Number.isFinite(prevWindowStars)
      ? Math.max(0, totalStars - prevWindowStars)
      : null;

  // Most-active 7d — top repo by 7d star delta in this sector.
  const mostActive7d = [...repos]
    .filter((r) => !r.starsDelta7dMissing && r.starsDelta7d > 0)
    .sort((a, b) => b.starsDelta7d - a.starsDelta7d)[0];

  // Avg momentum across the sector.
  const avgMomentum =
    repos.length > 0
      ? Number(
          (
            repos.reduce((sum, r) => sum + r.momentumScore, 0) / repos.length
          ).toFixed(2),
        )
      : 0;

  // Movement counts feed the verdict tone.
  const breakouts = repos.filter((r) => r.movementStatus === "breakout").length;
  const hot = repos.filter((r) => r.movementStatus === "hot").length;
  const moving = breakouts + hot;
  const verdictTone: "money" | "acc" | "amber" =
    breakouts > 0 ? "money" : moving > 0 ? "acc" : "amber";

  // Topic chips — most-frequent topics across this category's repos.
  const topicChips = collectTopTopics(repos, 5);

  // Repos sorted for the grid — momentum-first, then stars.
  const sortedRepos = [...repos].sort((a, b) => {
    if (b.momentumScore !== a.momentumScore) {
      return b.momentumScore - a.momentumScore;
    }
    return b.stars - a.stars;
  });
  const gridRepos = sortedRepos.slice(0, 24);

  // Related categories — siblings in the same constants order, excluding
  // this one. Sorted by repo count so the most-populated neighbours appear
  // first.
  const allStats = getDerivedCategoryStats();
  const statsById = new Map(allStats.map((s) => [s.categoryId, s]));
  const relatedCategories = CATEGORIES.filter((c) => c.id !== slug)
    .map((c) => {
      const s = statsById.get(c.id);
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        repoCount: s?.repoCount ?? 0,
      };
    })
    .sort((a, b) => b.repoCount - a.repoCount)
    .slice(0, 6);

  return (
    <main className="home-surface category-detail-page">
      <ProfileTemplate
        crumb={
          <>
            <b>CATEGORY</b> · TERMINAL · /CATEGORIES/{slug.toUpperCase()}
          </>
        }
        identity={
          <CategoryIdentity
            name={category.name}
            description={category.description}
            color={category.color}
            iconName={category.icon}
            repoCount={repos.length}
            topics={topicChips}
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
            {formatNumber(repos.length)} REPOS · TRACKED
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// CATEGORY",
              headline: `${repos.length} repos tracked`,
              sub: `${breakouts} breakout · ${hot} hot · avg mom ${avgMomentum.toFixed(1)}`,
            }}
            text={
              <>
                <b>{category.name}</b> tracks{" "}
                <span style={{ color: "var(--v4-ink-100)" }}>
                  {repos.length}
                </span>{" "}
                repos.{" "}
                {breakouts > 0 ? (
                  <>
                    <span style={{ color: "var(--v4-money)" }}>
                      {breakouts} breaking out
                    </span>{" "}
                    right now,{" "}
                  </>
                ) : null}
                <span style={{ color: "var(--v4-acc)" }}>{moving} moving</span>{" "}
                across the sector.
              </>
            }
            actionHref="/categories"
            actionLabel="ALL CATEGORIES →"
          />
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: "REPOS",
                value: formatNumber(repos.length),
                sub: "in this sector",
                pip: category.color,
              },
              {
                label: "TOTAL STARS",
                value: formatNumber(totalStars),
                sub: "lifetime",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "LANGUAGES",
                value: formatNumber(languageCount),
                sub: languageCount > 0 ? "distinct" : "no data",
                pip: "var(--v4-ink-300)",
              },
              {
                label: `SECTOR Δ · ${TRACK_LABEL[trackWindow]}`,
                value:
                  sectorWindowDelta !== null
                    ? `+${formatNumber(sectorWindowDelta)}`
                    : mostActive7d
                      ? `+${formatNumber(mostActive7d.starsDelta7d)}`
                      : "—",
                sub:
                  sectorWindowDelta !== null
                    ? "stars added in window"
                    : mostActive7d
                      ? `top mover · ${mostActive7d.fullName}`
                      : "no movement",
                tone: sectorWindowDelta !== null || mostActive7d ? "money" : "default",
                pip: "var(--v4-amber)",
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead
              num="// 01"
              title="Repos · ranked"
              meta={
                <>
                  <b>{gridRepos.length}</b> shown ·{" "}
                  {repos.length > gridRepos.length
                    ? `${repos.length} total`
                    : "all"}{" "}
                  · window <b>{TRACK_LABEL[trackWindow]}</b>
                </>
              }
            />
            {/* W5-CATWINDOW — tracking window tabs. Server-rendered
                <Link>s so the URL stays canonical/shareable + the page
                stays a server component. */}
            <nav
              aria-label="Tracking window"
              style={{
                display: "flex",
                gap: 6,
                paddingBottom: 12,
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              <span style={{ color: "var(--v4-ink-400)", paddingRight: 6 }}>
                WINDOW ·
              </span>
              {TRACK_WINDOWS.map((w) => {
                const active = w === trackWindow;
                const href =
                  w === "7d"
                    ? `/categories/${slug}`
                    : `/categories/${slug}?window=${w}`;
                return (
                  <Link
                    key={w}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 2,
                      border: `1px solid ${active ? "var(--v4-acc)" : "var(--v4-line-200)"}`,
                      color: active ? "var(--v4-ink-000)" : "var(--v4-ink-300)",
                      background: active
                        ? "color-mix(in oklab, var(--v4-acc) 14%, transparent)"
                        : "transparent",
                      textDecoration: "none",
                    }}
                  >
                    {TRACK_LABEL[w]}
                  </Link>
                );
              })}
              {sectorWindowDelta !== null ? (
                <span
                  style={{ color: "var(--v4-money)", marginLeft: 12 }}
                >
                  +{formatNumber(sectorWindowDelta)} stars · sector
                </span>
              ) : (
                <span style={{ color: "var(--v4-ink-400)", marginLeft: 12 }}>
                  warming
                </span>
              )}
            </nav>
            {gridRepos.length > 0 ? (
              <div className="v4-profile-template__related">
                {gridRepos.map((repo) => {
                  const [owner, name] = repo.fullName.split("/");
                  const href =
                    owner && name ? `/repo/${owner}/${name}` : undefined;
                  return (
                    <RelatedRepoCard
                      key={repo.fullName}
                      fullName={repo.fullName}
                      description={repo.description?.trim() || undefined}
                      language={
                        repo.language
                          ? repo.language.toUpperCase()
                          : undefined
                      }
                      stars={formatNumber(repo.stars)}
                      similarity={
                        repo.movementStatus
                          ? repo.movementStatus.toUpperCase().replace("_", " ")
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
                No repos in this category yet — pool is warming.
              </p>
            )}
          </>
        }
        rightRail={
          <>
            <SectionHead num="// 02" title="About" as="h3" />
            <div className="v4-collection-rail-card">
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Sector</span>
                <span className="v4-collection-rail-card__value">
                  {category.name}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Short</span>
                <span className="v4-collection-rail-card__value">
                  {category.shortName}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Repos</span>
                <span className="v4-collection-rail-card__value">
                  {formatNumber(repos.length)}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">
                  Avg momentum
                </span>
                <span className="v4-collection-rail-card__value">
                  {avgMomentum.toFixed(1)}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Source</span>
                <span className="v4-collection-rail-card__value">
                  src/lib/constants.ts
                </span>
              </div>
            </div>

            <SectionHead num="// 03" title="Related categories" as="h3" />
            {relatedCategories.length > 0 ? (
              <ul className="v4-collection-rail-list">
                {relatedCategories.map((c) => (
                  <li
                    key={c.id}
                    className="v4-collection-rail-list__item"
                  >
                    <Link
                      href={`/categories/${c.id}`}
                      className="v4-collection-rail-list__link"
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 6,
                            height: 6,
                            background: c.color,
                            borderRadius: 1,
                            flexShrink: 0,
                          }}
                        />
                        <span>{c.name}</span>
                      </span>
                      <span className="v4-collection-rail-list__count">
                        {c.repoCount}
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
                No related categories.
              </p>
            )}
          </>
        }
      />
    </main>
  );
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return CATEGORIES.map((c) => ({ slug: c.id }));
}

// --- Composition helpers --------------------------------------------------

interface CategoryIdentityProps {
  name: string;
  description: string;
  color: string;
  iconName: string;
  repoCount: number;
  topics: string[];
}

function CategoryIdentity({
  name,
  description,
  color,
  iconName,
  repoCount,
  topics,
}: CategoryIdentityProps) {
  const Icon = getCategoryIcon(iconName);
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
          border: `1px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {Icon ? (
          <Icon size={26} style={{ color }} aria-hidden="true" />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 22,
              color,
              textTransform: "uppercase",
            }}
          >
            {name.slice(0, 2)}
          </span>
        )}
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
          {description}.
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
            <b style={{ color: "var(--v4-ink-100)" }}>
              {formatNumber(repoCount)}
            </b>
          </span>
          {repoCount > 0 ? (
            <span style={{ color: "var(--v4-money)" }}>● TRACKED</span>
          ) : (
            <span style={{ color: "var(--v4-amber)" }}>● WARMING</span>
          )}
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
