// /skills/[slug] — V4 W9 ProfileTemplate consumer.
//
// One detail page per skill, keyed by the base64url-encoded skill `id` so
// composite ids (Smithery `namespace/slug`, skillsmp `parent#child`) survive
// the dynamic-segment routing.
//
// Layout:
//   identity   — skill name + creator + repo + tag chips
//   verdict    — signal-score stamp + cited / popularity highlights
//   kpiBand    — Stars · Forks · Mentions · Cited by
//   mainPanels — README link + mentions feed (// 01) + related (// 02)
//   rightRail  — install snippets (// 03) + related repos (// 04)

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getSkillsSignalData,
  type EcosystemLeaderboardItem,
} from "@/lib/ecosystem-leaderboards";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";

import { decodeSkillSlug, encodeSkillSlug } from "../_slug";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function findSkillBySlug(
  slug: string,
): Promise<{ skill: EcosystemLeaderboardItem; siblings: EcosystemLeaderboardItem[] } | null> {
  let id: string;
  try {
    id = decodeSkillSlug(slug);
  } catch {
    return null;
  }
  const data = await getSkillsSignalData();
  const skill = data.combined.items.find((it) => it.id === id);
  if (!skill) return null;
  return { skill, siblings: data.combined.items };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await findSkillBySlug(slug);
  const canonical = absoluteUrl(`/skills/${slug}`);
  if (!found) {
    return {
      title: `Skill Not Found - ${SITE_NAME}`,
      description: "This skill is not in the leaderboard or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const { skill } = found;
  const title = `${skill.title} - Skill - ${SITE_NAME}`;
  const description =
    skill.description?.trim() ||
    `${skill.title} on the ${SITE_NAME} skills leaderboard. Signal score ${skill.signalScore}/100 across ${skill.crossSourceCount} registries.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SkillDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const found = await findSkillBySlug(slug);
  if (!found) notFound();
  const { skill, siblings } = found;

  // Related skills — same author OR shared topic, sorted by signal score.
  const related = siblings
    .filter((it) => {
      if (it.id === skill.id) return false;
      if (skill.author && it.author === skill.author) return true;
      if (skill.topic && it.topic === skill.topic) return true;
      const aTags = new Set(skill.tags);
      return it.tags.some((t) => aTags.has(t));
    })
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, 6);

  const verdictTone =
    skill.signalScore >= 70 ? "money" : skill.signalScore >= 40 ? "acc" : "amber";
  const repoFullName = skill.linkedRepo;
  const popularityLabel = skill.popularity
    ? `${formatNumber(skill.popularity)} ${skill.popularityLabel}`
    : "—";
  const cited = skill.derivativeRepoCount ?? 0;
  const forks = skill.forks ?? 0;

  return (
    <main className="home-surface">
      <ProfileTemplate
        crumb={
          <>
            <b>SKILL</b> · TERMINAL · /SKILLS/{slug.slice(0, 16).toUpperCase()}
          </>
        }
        identity={
          <SkillIdentity
            title={skill.title}
            author={skill.author}
            description={skill.description}
            url={skill.url}
            linkedRepo={skill.linkedRepo}
            tags={skill.tags}
            agents={skill.agents}
            sourceLabel={skill.sourceLabel}
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
            score · {skill.signalScore}/100
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// SKILL",
              headline: `${skill.signalScore}/100 signal`,
              sub: `${skill.crossSourceCount} registries · rank #${skill.rank}`,
            }}
            text={
              <>
                <b>{skill.title}</b> ranked{" "}
                <span style={{ color: "var(--v4-ink-100)" }}>
                  #{skill.rank}
                </span>{" "}
                in the combined leaderboard.{" "}
                {cited > 0 ? (
                  <>
                    <span style={{ color: "var(--v4-amber)" }}>
                      {formatNumber(cited)} downstream
                    </span>{" "}
                    repos cite it.{" "}
                  </>
                ) : null}
                Source:{" "}
                <span style={{ color: "var(--v4-acc)" }}>
                  {skill.sourceLabel}
                </span>
                .
              </>
            }
            actionHref={skill.url}
            actionLabel="OPEN ↗"
          />
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: skill.popularityLabel
                  ? `${skill.popularityLabel}`
                  : "Stars",
                value: popularityLabel,
                sub: skill.popularityLabel === "stars" ? "GitHub" : "upstream",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "Forks",
                value: forks > 0 ? formatNumber(forks) : "—",
                sub:
                  skill.forkVelocity7d && skill.forkVelocity7d > 0
                    ? `+${formatNumber(skill.forkVelocity7d)} · 7d`
                    : "no 7d delta",
                tone: forks > 0 ? "default" : "default",
              },
              {
                label: "Mentions",
                value: skill.installs7d
                  ? formatNumber(skill.installs7d)
                  : "—",
                sub: skill.installs7d ? "installs · 7d" : "no install data",
                tone: skill.installs7d ? "acc" : "default",
                pip: "var(--v4-acc)",
              },
              {
                label: "Cited by",
                value: cited > 0 ? formatNumber(cited) : "—",
                sub: cited > 0 ? "derivative repos" : "no citations yet",
                tone: cited > 0 ? "amber" : "default",
                pip: "var(--v4-amber)",
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead num="// 01" title="README · upstream" />
            <div className="v4-collection-rail-card">
              {skill.description ? (
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-geist-sans), sans-serif",
                    fontSize: 14,
                    color: "var(--v4-ink-200)",
                    lineHeight: 1.55,
                  }}
                >
                  {skill.description}
                </p>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 12,
                    color: "var(--v4-ink-400)",
                  }}
                >
                  No description published upstream. Open the source for
                  full details.
                </p>
              )}
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                }}
              >
                <a
                  href={skill.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--v4-acc)" }}
                >
                  Open source ↗
                </a>
                {repoFullName ? (
                  <Link
                    href={`/repo/${repoFullName}`}
                    style={{ color: "var(--v4-acc)" }}
                  >
                    /repo/{repoFullName}
                  </Link>
                ) : null}
              </div>
            </div>

            <SectionHead
              num="// 02"
              title="Mentions feed"
              meta={`${skill.crossSourceCount} REGISTRIES`}
            />
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <li className="v4-collection-activity__row">
                <span className="v4-collection-activity__name">
                  {skill.sourceLabel}
                </span>
                <span className="v4-collection-activity__delta">
                  {popularityLabel}
                </span>
                <span className="v4-collection-activity__status">PRIMARY</span>
              </li>
              {skill.derivativeSources && skill.derivativeSources.length > 0
                ? skill.derivativeSources.slice(0, 6).map((src) => (
                    <li
                      key={src}
                      className="v4-collection-activity__row"
                    >
                      <span className="v4-collection-activity__name">
                        {src}
                      </span>
                      <span className="v4-collection-activity__delta">
                        derivative source
                      </span>
                      <span className="v4-collection-activity__status">
                        CITED
                      </span>
                    </li>
                  ))
                : null}
            </ul>
          </>
        }
        rightRail={
          <>
            <SectionHead num="// 03" title="Install" as="h3" />
            <div className="v4-collection-rail-card">
              {repoFullName ? (
                <pre
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: "var(--v4-ink-100)",
                    background: "var(--v4-bg-100)",
                    padding: "8px 10px",
                    borderRadius: 3,
                    border: "1px solid var(--v4-line-200)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {`gh repo clone ${repoFullName}`}
                </pre>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: "var(--v4-ink-300)",
                  }}
                >
                  No GitHub source detected. Open upstream for install
                  instructions.
                </p>
              )}
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Source</span>
                <a
                  className="v4-collection-rail-card__value"
                  href={skill.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {skill.sourceLabel} ↗
                </a>
              </div>
              {skill.author ? (
                <div className="v4-collection-rail-card__row">
                  <span className="v4-collection-rail-card__label">Author</span>
                  <span className="v4-collection-rail-card__value">
                    {skill.author}
                  </span>
                </div>
              ) : null}
              {skill.lastPushedAt ? (
                <div className="v4-collection-rail-card__row">
                  <span className="v4-collection-rail-card__label">
                    Last pushed
                  </span>
                  <span className="v4-collection-rail-card__value">
                    {new Date(skill.lastPushedAt).toISOString().slice(0, 10)}
                  </span>
                </div>
              ) : null}
            </div>

            <SectionHead num="// 04" title="Related skills" as="h3" />
            {related.length > 0 ? (
              <ul className="v4-collection-rail-list">
                {related.map((it) => (
                  <li key={it.id} className="v4-collection-rail-list__item">
                    <Link
                      href={`/skills/${encodeSkillSlug(it.id)}`}
                      className="v4-collection-rail-list__link"
                    >
                      <span>{it.title}</span>
                      <span className="v4-collection-rail-list__count">
                        {it.signalScore}
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
                No related skills.
              </p>
            )}
          </>
        }
      />
    </main>
  );
}

interface SkillIdentityProps {
  title: string;
  author: string | null;
  description: string | null;
  url: string;
  linkedRepo: string | null;
  tags: string[];
  agents: string[];
  sourceLabel: string;
}

function SkillIdentity({
  title,
  author,
  description,
  url,
  linkedRepo,
  tags,
  agents,
  sourceLabel,
}: SkillIdentityProps) {
  const chips = [...new Set([...tags.slice(0, 4), ...agents.slice(0, 2)])];
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
        {title.slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          {title}
        </h1>
        <p
          className="v4-page-head__lede"
          style={{ marginTop: 0, marginBottom: 10 }}
        >
          {description ??
            `${title} on the ${sourceLabel} leaderboard. Aggregated by TrendingRepo.`}
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
          {author ? (
            <span>
              BY{" "}
              <b style={{ color: "var(--v4-ink-100)" }}>{author}</b>
            </span>
          ) : null}
          {linkedRepo ? (
            <Link
              href={`/repo/${linkedRepo}`}
              style={{
                color: "var(--v4-acc)",
                textDecoration: "none",
              }}
            >
              /repo/{linkedRepo}
            </Link>
          ) : null}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--v4-acc)" }}
          >
            SOURCE ↗
          </a>
          {chips.map((chip) => (
            <span
              key={chip}
              style={{
                padding: "1px 6px",
                border: "1px solid var(--v4-line-200)",
                borderRadius: 2,
                color: "var(--v4-ink-300)",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
