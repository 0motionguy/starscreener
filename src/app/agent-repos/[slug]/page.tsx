// /agent-repos/[slug] — V4 ProfileTemplate consumer.
//
// Detail page for a single curated agent repo. The slug is the
// `slugToId(fullName)` form (e.g. "anthropics--claude-code"). We resolve
// it back to a Repo from the curated AGENT_REPO_FULL_NAMES set.
//
// Slot composition:
//   identity     — agent name + framework (language) + tag chips
//   kpiBand      — Stars · Forks · Last release · Mentions (24h)
//   mainPanels   — README link, capabilities (topics/tags), recent mentions
//   rightRail    — Install / quick-start, related agent repos

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  AGENT_REPO_FULL_NAMES,
  selectAgentRepos,
} from "@/lib/agent-repos";
import { getDerivedRepos } from "@/lib/derived-repos";
import { formatNumber, getRelativeTime, slugToId } from "@/lib/utils";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import type { Repo } from "@/lib/types";

import { ProfileTemplate } from "@/components/templates/ProfileTemplate";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function findAgentRepoBySlug(slug: string): Repo | null {
  const repos = selectAgentRepos(getDerivedRepos());
  const match = repos.find((repo) => slugToId(repo.fullName) === slug);
  return match ?? null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const canonical = absoluteUrl(`/agent-repos/${slug}`);
  const repo = findAgentRepoBySlug(slug);
  if (!repo) {
    return {
      title: `Agent repo not found — ${SITE_NAME}`,
      description: `We don't have ${slug} on the agent repos board yet.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${repo.fullName} — Agent repo · ${SITE_NAME}`;
  const description =
    repo.description?.trim() ||
    `${repo.fullName} agent runtime / framework on ${SITE_NAME}.`;
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
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return AGENT_REPO_FULL_NAMES.map((fullName) => ({
    slug: slugToId(fullName),
  }));
}

export default async function AgentRepoDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const repo = findAgentRepoBySlug(slug);
  if (!repo) notFound();

  // Frame the rest of the curated set so we can pick "related" siblings.
  const allAgentRepos = selectAgentRepos(getDerivedRepos());
  const related = allAgentRepos
    .filter((other) => other.fullName !== repo.fullName)
    .slice(0, 6);

  const tags = (repo.tags ?? []).slice(0, 8);
  const topics = (repo.topics ?? []).slice(0, 8);
  const capabilityChips = tags.length > 0 ? tags : topics;
  const framework = repo.language ?? "—";
  const mentions24h = repo.mentionCount24h ?? 0;
  const lastRelease = repo.lastReleaseAt
    ? getRelativeTime(repo.lastReleaseAt)
    : "—";
  const lastReleaseTag = repo.lastReleaseTag ?? "no release";

  const verdictTone =
    repo.starsDelta24h > 0 ? "money" : repo.starsDelta24h < 0 ? "amber" : "acc";
  const deltaPrefix = repo.starsDelta24h >= 0 ? "+" : "";

  return (
    <main className="home-surface agent-repo-detail-page">
      <ProfileTemplate
        crumb={
          <>
            <b>AGENT</b> · TERMINAL · /AGENT-REPOS/{slug.toUpperCase()}
          </>
        }
        identity={
          <AgentIdentity
            owner={repo.owner}
            name={repo.name}
            description={repo.description}
            framework={framework}
            chips={capabilityChips}
            url={repo.url || `https://github.com/${repo.fullName}`}
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
            updated · {getRelativeTime(repo.lastCommitAt)}
          </span>
        }
        verdict={
          <VerdictRibbon
            tone={verdictTone}
            stamp={{
              eyebrow: "// AGENT",
              headline: `${formatNumber(repo.stars)} STARS`,
              sub: `${deltaPrefix}${formatNumber(repo.starsDelta24h)} · 24h`,
            }}
            text={
              <>
                <b>{repo.fullName}</b> moved{" "}
                <span
                  style={{
                    color:
                      repo.starsDelta24h >= 0
                        ? "var(--v4-money)"
                        : "var(--v4-red)",
                  }}
                >
                  {deltaPrefix}
                  {formatNumber(repo.starsDelta24h)} stars
                </span>{" "}
                in 24h with momentum score{" "}
                <span style={{ color: "var(--v4-acc)" }}>
                  {repo.momentumScore.toFixed(1)}
                </span>
                .
              </>
            }
            actionHref={`/repo/${repo.owner}/${repo.name}`}
            actionLabel="FULL PROFILE →"
          />
        }
        kpiBand={
          <KpiBand
            cells={[
              {
                label: "Stars",
                value: formatNumber(repo.stars),
                sub: `${deltaPrefix}${formatNumber(repo.starsDelta24h)} · 24h`,
                tone: "money",
              },
              {
                label: "Forks",
                value: formatNumber(repo.forks),
                sub: `+${formatNumber(repo.forksDelta7d)} · 7d`,
              },
              {
                label: "Last release",
                value: lastRelease,
                sub: lastReleaseTag,
                tone: "acc",
              },
              {
                label: "Mentions · 24h",
                value: formatNumber(mentions24h),
                sub: `score ${repo.socialBuzzScore.toFixed(0)}`,
              },
            ]}
          />
        }
        mainPanels={
          <>
            <SectionHead num="// 01" title="README" meta="UPSTREAM" />
            <div className="v4-collection-rail-card">
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-200)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {repo.description?.trim() ||
                  "No description available for this agent repo."}
              </p>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">README</span>
                <a
                  className="v4-collection-rail-card__value"
                  href={`${repo.url || `https://github.com/${repo.fullName}`}#readme`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--v4-acc)" }}
                >
                  open on GitHub ↗
                </a>
              </div>
            </div>

            <SectionHead
              num="// 02"
              title="Capabilities"
              meta={`${capabilityChips.length} TAGS`}
            />
            {capabilityChips.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "8px 0 16px",
                }}
              >
                {capabilityChips.map((chip) => (
                  <span
                    key={chip}
                    style={{
                      padding: "2px 8px",
                      border: "1px solid var(--v4-line-200)",
                      borderRadius: 2,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 11,
                      color: "var(--v4-ink-200)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v4-ink-300)",
                  padding: "8px 0",
                }}
              >
                No capability tags surfaced yet.
              </p>
            )}

            <SectionHead
              num="// 03"
              title="Mentions"
              meta={`${formatNumber(mentions24h)} · 24H`}
            />
            <div className="v4-collection-rail-card">
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Reddit · 7d</span>
                <span className="v4-collection-rail-card__value">
                  {repo.reddit
                    ? formatNumber(repo.reddit.mentions7d)
                    : "0"}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">X · 24h</span>
                <span className="v4-collection-rail-card__value">
                  {repo.twitter
                    ? formatNumber(repo.twitter.mentionCount24h)
                    : "0"}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Buzz score</span>
                <span className="v4-collection-rail-card__value">
                  {repo.socialBuzzScore.toFixed(0)} / 100
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">
                  Channels firing
                </span>
                <span className="v4-collection-rail-card__value">
                  {repo.channelsFiring ?? 0} / 5
                </span>
              </div>
            </div>
          </>
        }
        rightRail={
          <>
            <SectionHead num="// 04" title="Install" as="h3" />
            <div className="v4-collection-rail-card">
              <p
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-300)",
                  margin: "0 0 8px",
                }}
              >
                Quick start — clone the repo and follow the upstream README.
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  background: "var(--v4-bg-100)",
                  border: "1px solid var(--v4-line-200)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-100)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {`git clone https://github.com/${repo.fullName}.git`}
              </pre>
              <div
                className="v4-collection-rail-card__row"
                style={{ marginTop: 8 }}
              >
                <span className="v4-collection-rail-card__label">Framework</span>
                <span className="v4-collection-rail-card__value">
                  {framework}
                </span>
              </div>
              <div className="v4-collection-rail-card__row">
                <span className="v4-collection-rail-card__label">Source</span>
                <a
                  className="v4-collection-rail-card__value"
                  href={repo.url || `https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--v4-acc)" }}
                >
                  GitHub ↗
                </a>
              </div>
              <div className="v4-collection-rail-card__row">
                <Link
                  href={`/repo/${repo.owner}/${repo.name}`}
                  style={{
                    color: "var(--v4-acc)",
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Open full repo profile →
                </Link>
              </div>
            </div>

            <SectionHead num="// 05" title="Related agents" as="h3" />
            {related.length > 0 ? (
              <ul className="v4-collection-rail-list">
                {related.slice(0, 5).map((other) => (
                  <li
                    key={other.fullName}
                    className="v4-collection-rail-list__item"
                  >
                    <Link
                      href={`/agent-repos/${slugToId(other.fullName)}`}
                      className="v4-collection-rail-list__link"
                    >
                      <span>{other.fullName}</span>
                      <span className="v4-collection-rail-list__count">
                        {formatNumber(other.stars)}
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
                No related agent repos.
              </p>
            )}
          </>
        }
        relatedEyebrow="MORE AGENT REPOS"
        related={
          related.length > 0 ? (
            <>
              {related.map((other) => {
                const otherSlug = slugToId(other.fullName);
                return (
                  <RelatedRepoCard
                    key={other.fullName}
                    fullName={other.fullName}
                    description={
                      other.description?.trim() ||
                      (other.language ?? "agent repo")
                    }
                    language={
                      other.language ? other.language.toUpperCase() : undefined
                    }
                    stars={formatNumber(other.stars)}
                    similarity={
                      other.movementStatus
                        ? other.movementStatus.toUpperCase()
                        : undefined
                    }
                    href={`/agent-repos/${otherSlug}`}
                  />
                );
              })}
            </>
          ) : undefined
        }
      />
    </main>
  );
}

interface AgentIdentityProps {
  owner: string;
  name: string;
  description: string;
  framework: string;
  chips: string[];
  url: string;
}

function AgentIdentity({
  owner,
  name,
  description,
  framework,
  chips,
  url,
}: AgentIdentityProps) {
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
        {name.slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          className="v4-page-head__h1"
          style={{ marginTop: 0, marginBottom: 4 }}
        >
          <span style={{ color: "var(--v4-ink-300)" }}>{owner} /</span> {name}{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--v4-acc)",
              fontSize: 18,
              verticalAlign: "middle",
            }}
            aria-label={`Open ${owner}/${name} on GitHub`}
          >
            ↗
          </a>
        </h1>
        {description ? (
          <p
            className="v4-page-head__lede"
            style={{ marginTop: 0, marginBottom: 10 }}
          >
            {description}
          </p>
        ) : null}
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
          <span>
            FRAMEWORK{" "}
            <b style={{ color: "var(--v4-ink-100)" }}>{framework}</b>
          </span>
          {chips.slice(0, 5).map((chip) => (
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
