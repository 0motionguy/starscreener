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

function SkillsRightRail({ board }: { board: EcosystemBoard }) {
  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-card border border-border-primary bg-bg-card p-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          Top Skills
        </h3>
        {board.items.length === 0 ? (
          <p className="mt-2 text-[11px] text-text-tertiary">No rows yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {board.items.slice(0, 10).map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-[11px]">
                {item.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.logoUrl}
                    alt=""
                    width={16}
                    height={16}
                    loading="lazy"
                    className="h-4 w-4 flex-none rounded-sm object-contain"
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
