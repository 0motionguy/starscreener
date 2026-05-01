// /skills — V4 leaderboard list (W8 leaderboard pattern).
//
// Migrated off the legacy SignalSourcePage + SkillsTerminalTable chrome to
// V4 primitives: PageHead + VerdictRibbon + KpiBand + SectionHead + RankRow.
// Two main sections — `// 01 Top skills` (signal-score leaderboard) and
// `// 02 New / breakout` (recent + Δhotness pickup). Right rail surfaces
// the Most-cited list and worker keys.
//
// Mockup reference: home.html top10 panel + breakouts.html leaderboard.

import type { Metadata } from "next";
import Link from "next/link";

import { getSkillsSignalData } from "@/lib/ecosystem-leaderboards";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber } from "@/lib/utils";

import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { LiveDot } from "@/components/ui/LiveDot";
import { RankRow } from "@/components/ui/RankRow";

import { encodeSkillSlug } from "./_slug";

export const revalidate = 1800;

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 20;
const DESCRIPTION =
  "Top Claude / Codex / agent skills merged from skills.sh, GitHub, Smithery, lobehub, and skillsmp.";

export const metadata: Metadata = {
  title: `Trending Skills - ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/skills") },
  openGraph: {
    title: `Trending Skills - ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/skills"),
  },
};

export default async function SkillsPage() {
  const data = await getSkillsSignalData();
  const items = data.combined.items;
  const now = Date.now();

  // Top by signal score — primary leaderboard (also the page's #1 row).
  const topByScore = [...items]
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, TOP_N);

  // Top by stars — leaderboard tile in the KPI band.
  const topByStars = [...items]
    .filter((it) => typeof it.popularity === "number" && it.popularity! > 0)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];

  // New in last 7 days — by createdAt fallback to lastPushedAt.
  const newRecent = items.filter((it) => {
    const iso = it.createdAt ?? it.lastPushedAt;
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && now - t <= ONE_WEEK_MS;
  });

  // Most-cited (derivative repo count >= 1) — used for KPI + right rail.
  const mostCited = [...items]
    .filter((it) => (it.derivativeRepoCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.derivativeRepoCount ?? 0) - (a.derivativeRepoCount ?? 0) ||
        b.signalScore - a.signalScore,
    );

  // Breakout slice — new-this-week sorted by Δhotness fallback to absolute hotness.
  const breakout = [...newRecent]
    .sort((a, b) => {
      const aDelta = (a.hotness ?? 0) - (a.hotnessPrev7d ?? a.hotness ?? 0);
      const bDelta = (b.hotness ?? 0) - (b.hotnessPrev7d ?? b.hotness ?? 0);
      if (aDelta !== bDelta) return bDelta - aDelta;
      return (b.hotness ?? b.signalScore) - (a.hotness ?? a.signalScore);
    })
    .slice(0, 10);

  // Average accuracy proxy = average signal score across the top 20 (used as
  // the verdict ribbon stamp). Not a true accuracy metric — the leaderboard
  // doesn't have one — but mirrors the V4 verdict-ribbon stamp slot used on
  // /consensus. Cold-start safe: fallback to 0.
  const avgScore =
    topByScore.length > 0
      ? Math.round(
          topByScore.reduce((acc, it) => acc + it.signalScore, 0) /
            topByScore.length,
        )
      : 0;

  const totalLabel = formatNumber(items.length);
  const newCount = newRecent.length;
  const citedCount = mostCited.length;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>SKILLS</b> · TERMINAL · /SKILLS
          </>
        }
        h1="Top AI agent skills, ranked across five registries."
        lede="A live leaderboard merging skills.sh, GitHub topic feeds, Smithery, lobehub, and skillsmp into one signal-scored list. Ranked by combined popularity, freshness, and derivative-repo citations."
        clock={
          <>
            <span className="big">{totalLabel}</span>
            <span className="muted">SKILLS · 5 REGISTRIES</span>
            <LiveDot label="LIVE" />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// SKILLS BOARD",
          headline: `${avgScore}/100 avg signal · top ${topByScore.length}`,
          sub: `${data.skillsSh.items.length} skills.sh · ${data.github.items.length} github · ${citedCount} cited`,
        }}
        text={
          <>
            <b>{totalLabel} skills</b> tracked across five registries.{" "}
            {newCount > 0 ? (
              <>
                <span style={{ color: "var(--v4-money)" }}>
                  {newCount} new this week
                </span>
                {", "}
              </>
            ) : null}
            <span style={{ color: "var(--v4-acc)" }}>
              {citedCount} cited by downstream repos
            </span>
            {topByScore[0] ? (
              <>
                {" · "}top pick{" "}
                <span style={{ color: "var(--v4-ink-100)" }}>
                  {topByScore[0].title}
                </span>
              </>
            ) : null}
            .
          </>
        }
        actionHref="/api/skills"
        actionLabel="API →"
      />

      <KpiBand
        cells={[
          {
            label: "Total skills",
            value: totalLabel,
            sub: "across 5 registries",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "Top by stars",
            value: topByStars
              ? formatNumber(topByStars.popularity ?? 0)
              : "—",
            sub: topByStars ? topByStars.title : "no popularity data",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "New · 7d",
            value: formatNumber(newCount),
            sub: newCount > 0 ? "created or pushed" : "no new skills",
            tone: newCount > 0 ? "acc" : "default",
            pip: "var(--v4-acc)",
          },
          {
            label: "Most-cited",
            value: formatNumber(citedCount),
            sub: "derivative repos found",
            tone: citedCount > 0 ? "amber" : "default",
            pip: "var(--v4-amber)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Top skills"
        meta={
          <>
            <b>{topByScore.length}</b> · ranked by signal score
          </>
        }
      />
      {topByScore.length > 0 ? (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 4,
            background: "var(--v4-bg-050)",
            marginBottom: 24,
          }}
        >
          {topByScore.map((item, idx) => (
            <RankRow
              key={item.id}
              rank={idx + 1}
              first={idx === 0}
              avatar={
                <SkillAvatar
                  logoUrl={item.logoUrl}
                  fallback={item.title}
                />
              }
              title={
                <>
                  {item.author ? (
                    <>
                      <span style={{ color: "var(--v4-ink-300)" }}>
                        {item.author}
                      </span>
                      <span style={{ color: "var(--v4-ink-400)" }}> / </span>
                    </>
                  ) : null}
                  <span style={{ color: "var(--v4-ink-100)" }}>
                    {item.title}
                  </span>
                </>
              }
              desc={item.description ?? item.sourceLabel}
              metric={{
                value: item.signalScore.toFixed(0),
                label: "/ 100",
              }}
              delta={
                item.derivativeRepoCount && item.derivativeRepoCount > 0
                  ? {
                      value: `${formatNumber(item.derivativeRepoCount)} cited`,
                      direction: "up",
                    }
                  : item.popularity
                    ? {
                        value: `${formatNumber(item.popularity)} ${item.popularityLabel}`,
                        direction: "flat",
                      }
                    : undefined
              }
              href={`/skills/${encodeSkillSlug(item.id)}`}
            />
          ))}
        </section>
      ) : (
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 12,
            color: "var(--v4-ink-300)",
            padding: "24px 0",
          }}
        >
          No skills leaderboard rows have landed yet. Waiting for upstream
          fetchers to populate Redis.
        </p>
      )}

      <SectionHead
        num="// 02"
        title="New / breakout"
        meta={
          <>
            <b>{breakout.length}</b> · last 7d
          </>
        }
      />
      {breakout.length > 0 ? (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 4,
            background: "var(--v4-bg-050)",
          }}
        >
          {breakout.map((item, idx) => {
            const delta =
              (item.hotness ?? 0) - (item.hotnessPrev7d ?? item.hotness ?? 0);
            return (
              <RankRow
                key={item.id}
                rank={idx + 1}
                avatar={
                  <SkillAvatar
                    logoUrl={item.logoUrl}
                    fallback={item.title}
                  />
                }
                title={
                  <>
                    {item.author ? (
                      <>
                        <span style={{ color: "var(--v4-ink-300)" }}>
                          {item.author}
                        </span>
                        <span style={{ color: "var(--v4-ink-400)" }}> / </span>
                      </>
                    ) : null}
                    <span style={{ color: "var(--v4-ink-100)" }}>
                      {item.title}
                    </span>
                  </>
                }
                desc={item.description ?? item.sourceLabel}
                metric={{
                  value: (item.hotness ?? item.signalScore).toFixed(0),
                  label: "hot",
                }}
                delta={
                  delta !== 0
                    ? {
                        value: `${delta > 0 ? "+" : ""}${delta.toFixed(0)}`,
                        direction: delta > 0 ? "up" : "down",
                      }
                    : undefined
                }
                href={`/skills/${encodeSkillSlug(item.id)}`}
              />
            );
          })}
        </section>
      ) : (
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 12,
            color: "var(--v4-ink-300)",
            padding: "24px 0",
          }}
        >
          No skills created or pushed in the last 7 days.
        </p>
      )}

      <SectionHead num="// 03" title="Most-cited skills" as="h3" />
      {mostCited.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {mostCited.slice(0, 12).map((item) => (
            <li key={item.id}>
              <Link
                href={`/skills/${encodeSkillSlug(item.id)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--v4-line-200)",
                  borderRadius: 3,
                  background: "var(--v4-bg-050)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-200)",
                  textDecoration: "none",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "var(--v4-ink-100)",
                    }}
                  >
                    {item.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      color: "var(--v4-ink-400)",
                      fontSize: 10,
                    }}
                  >
                    {item.author ?? item.sourceLabel}
                  </span>
                </span>
                <span
                  style={{
                    color: "var(--v4-amber)",
                    fontWeight: 600,
                  }}
                >
                  {formatNumber(item.derivativeRepoCount ?? 0)}
                </span>
              </Link>
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
          No derivative repo citations recorded yet.
        </p>
      )}
    </main>
  );
}

interface SkillAvatarProps {
  logoUrl: string | null;
  fallback: string;
}

function SkillAvatar({ logoUrl, fallback }: SkillAvatarProps) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        style={{
          width: 28,
          height: 28,
          borderRadius: 3,
          objectFit: "contain",
          background: "var(--v4-bg-100)",
        }}
      />
    );
  }
  const text = fallback.slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 3,
        background: "var(--v4-bg-100)",
        border: "1px solid var(--v4-line-200)",
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
        color: "var(--v4-ink-200)",
      }}
    >
      {text}
    </span>
  );
}

