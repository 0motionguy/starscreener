import type { Metadata } from "next";
import Link from "next/link";

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import type { SignalMetricCardProps } from "@/components/signal/SignalMetricCard";
import {
  ecosystemBoardToRows,
  formatCompact,
  getSkillsSignalData,
  type EcosystemBoard,
} from "@/lib/ecosystem-leaderboards";
import { classifyFreshness } from "@/lib/news/freshness";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending Skills - TrendingRepo",
  description:
    "Top Claude / Codex / agent skills merged from skills.sh leaderboard and GitHub topic signals.",
  alternates: { canonical: absoluteUrl("/skills") },
  openGraph: {
    title: "Trending Skills - TrendingRepo",
    description:
      "A live leaderboard for AI agent skills across skills.sh and GitHub topic feeds.",
    url: absoluteUrl("/skills"),
  },
};

export default async function SkillsPage() {
  const data = await getSkillsSignalData();
  const freshness = classifyFreshness("skills", data.fetchedAt);

  const allRows = ecosystemBoardToRows(data.combined);
  const skillsShRows = ecosystemBoardToRows(data.skillsSh);
  const githubRows = ecosystemBoardToRows(data.github);

  const topItem = data.combined.items[0];

  const metrics: SignalMetricCardProps[] = [
    {
      label: "All Skills",
      value: data.combined.items.length,
      helper: `${data.skillsSh.items.length} skills.sh / ${data.github.items.length} github`,
      sparkTone: "brand",
    },
    {
      label: "Top Signal",
      value: signalValue(topItem),
      helper: topItem?.title ?? "no rows",
      sparkTone: "up",
    },
    {
      label: "Top Popularity",
      value: formatCompact(maxPopularity(data.combined)),
      helper: topItem?.popularityLabel ?? "skill signal",
      sparkTone: "warning",
    },
    {
      label: "Surface",
      value: "2",
      helper: "skills.sh / github",
      sparkTone: "info",
    },
    {
      label: "Worker Key",
      value: "SKILLS",
      helper: "trending-skill",
      sparkTone: "brand",
    },
    {
      label: "Data Tier",
      value: data.source.toUpperCase(),
      helper: data.fetchedAt ? freshness.ageLabel : "missing",
      sparkTone: data.source === "redis" ? "up" : "warning",
    },
  ];

  const tabs: SignalTabSpec[] = [
    {
      id: "all",
      label: "All Skills",
      rows: allRows,
      columns: ["rank", "title", "source", "topic", "linkedRepo", "engagement", "age", "signal"],
      emptyTitle: "No skills leaderboard rows have landed yet.",
      emptySubtitle: "Waiting for the publish-leaderboards job to write trending-skill.",
    },
    {
      id: "skills-sh",
      label: "Skills.sh",
      rows: skillsShRows,
      columns: ["rank", "title", "topic", "linkedRepo", "engagement", "age", "signal"],
      emptyTitle: "No skills.sh rows yet.",
      emptySubtitle: "skills.sh fetcher publishes to trending-skill-sh.",
    },
    {
      id: "github",
      label: "GitHub",
      rows: githubRows,
      columns: ["rank", "title", "topic", "linkedRepo", "engagement", "age", "signal"],
      emptyTitle: "No GitHub skill rows yet.",
      emptySubtitle: "GitHub topic fetcher publishes to trending-skill.",
    },
  ];

  return (
    <SignalSourcePage
      source="skills"
      sourceLabel="SKILLS"
      mode="TRENDING"
      subtitle="Merged AI agent skill momentum across skills.sh and GitHub topic feeds (claude-skill, agent-skill, claude-code-skill)."
      fetchedAt={data.fetchedAt}
      freshnessStatus={freshness.status}
      ageLabel={freshness.ageLabel}
      metrics={metrics}
      tabs={tabs}
      rightRail={<SkillsRightRail board={data.combined} />}
    />
  );
}

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
            <b>{topByScore.length}</b> · ranked by{" "}
            {haveWindowedData ? (
              <>installs Δ <b>{WINDOW_LABEL[sortWindow]}</b></>
            ) : (
              <>signal score</>
            )}
          </>
        }
      />

      {/* W5-SKILLS24H — tracking-window tab strip. Server-rendered links so
          the URL is canonical + shareable; default 7d (no query param).

          P0 INCIDENT 2026-05-02: when the install-snapshot worker hasn't
          populated `installsDelta1d/7d/30d` yet, every window tab returned
          identical results — page reads as "dead, not even data". Inline
          banner now explicitly tells the user the install-velocity layer
          is warming up so they don't conclude the leaderboard is broken.
          Items still render via signalScore fallback (the `topByScore`
          slice below) — only the per-window re-ranking is degraded. */}
      <nav
        aria-label="Re-rank skills by tracking window"
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 0 12px",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span style={{ color: "var(--v4-ink-400)", paddingRight: 6 }}>
          WINDOW ·
        </span>
        {SORT_WINDOWS.map((w) => {
          const active = w === sortWindow;
          const href = w === "7d" ? "/skills" : `/skills?window=${w}`;
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
              {WINDOW_LABEL[w]}
            </Link>
          );
        })}
        {!haveWindowedData ? (
          <span
            style={{
              marginLeft: "auto",
              color: "var(--v4-ink-400)",
              fontStyle: "italic",
            }}
          >
            install-velocity layer warming · ranked by signal score
          </span>
        ) : null}
      </nav>
      {!haveWindowedData ? (
        <p
          role="status"
          style={{
            margin: "0 0 16px",
            padding: "8px 12px",
            background: "color-mix(in oklab, var(--v4-amber) 8%, transparent)",
            border: "1px solid color-mix(in oklab, var(--v4-amber) 30%, transparent)",
            borderRadius: 3,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-ink-200)",
          }}
        >
          <b style={{ color: "var(--v4-amber)" }}>NOTE</b> · per-window install
          deltas (24h / 7d / 30d) are still warming up — the snapshot fetcher
          backfills daily. The leaderboard below is currently ordered by the
          combined signal score across {data.skillsSh.items.length}+
          {data.github.items.length} sources. Rows are real; ranking will
          re-sort by install velocity once the snapshot lands.
        </p>
      ) : null}
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
          {topByScore.map((item, idx) => {
            // W5-SKILLS24H — when the active window has data for this row,
            // surface the install delta as the primary delta chip.
            // Otherwise keep the original derivative-or-popularity chip.
            const windowDelta = deltaByItem.get(item.id);
            const windowDeltaChip =
              windowDelta !== undefined && windowDelta > 0
                ? {
                    value: `+${formatNumber(windowDelta)} ${WINDOW_LABEL[sortWindow]}`,
                    direction: "up" as const,
                  }
                : windowDelta !== undefined && windowDelta < 0
                  ? {
                      value: `${formatNumber(windowDelta)} ${WINDOW_LABEL[sortWindow]}`,
                      direction: "down" as const,
                    }
                  : undefined;
            const fallbackChip =
              item.derivativeRepoCount && item.derivativeRepoCount > 0
                ? {
                    value: `${formatNumber(item.derivativeRepoCount)} cited`,
                    direction: "up" as const,
                  }
                : item.popularity
                  ? {
                      value: `${formatNumber(item.popularity)} ${item.popularityLabel}`,
                      direction: "flat" as const,
                    }
                  : undefined;
            return (
              <RankRow
                key={item.id}
                rank={idx + 1}
                first={idx === 0}
                avatar={
                  <SkillAvatar
                    logoUrl={item.logoUrl}
                    fallback={item.title}
                  />
                ) : (
                  <span className="h-4 w-4 flex-none rounded-sm bg-bg-muted" />
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate font-mono text-functional hover:underline"
                  title={item.author ? `${item.title} — ${item.author}` : item.title}
                >
                  {item.title}
                </a>
                {item.verified ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-up" title="Verified author">
                    ✓
                  </span>
                ) : null}
                <span className="font-mono tabular-nums text-text-secondary">
                  {item.signalScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-card border border-border-primary bg-bg-card p-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Worker Keys
        </h3>
        <p className="mt-2 text-[11px] text-text-secondary">
          Skills are merged from
          <span className="font-mono text-text-primary"> trending-skill-sh </span>
          and
          <span className="font-mono text-text-primary"> trending-skill</span>.
        </p>
        <Link
          href="/api/skills"
          className="mt-3 inline-flex font-mono text-[11px] text-functional hover:underline"
        >
          api preview
        </Link>
      </div>
    </aside>
  );
}

function signalValue(item: { signalScore: number } | undefined): string {
  return item ? String(Math.round(item.signalScore)) : "-";
}

function maxPopularity(board: EcosystemBoard): number | null {
  const values = board.items
    .map((item) => item.popularity)
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}
