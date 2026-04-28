import type { Metadata } from "next";
import Link from "next/link";

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import {
  ecosystemBoardToRows,
  getSkillsSignalData,
  type EcosystemBoard,
} from "@/lib/ecosystem-leaderboards";
import { classifyFreshness } from "@/lib/news/freshness";
import { absoluteUrl } from "@/lib/seo";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildEcosystemHeader } from "@/components/signal/ecosystemTopHeader";

const SKILLS_ACCENT = "rgba(167, 139, 250, 0.85)";

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

  // V3 3-card top header — replaces the legacy 6-tile mini-strip with the
  // same chrome the news pages use (snapshot + per-source bars + topics).
  const { cards, topStories } = buildEcosystemHeader({
    items: data.combined.items,
    snapshotEyebrow: "// SNAPSHOT · NOW",
    snapshotLabel: "SKILLS TRACKED",
    snapshotRight: `${data.combined.items.length.toLocaleString("en-US")} ITEMS`,
    volumeEyebrow: "// VOLUME · PER SOURCE",
    topicsEyebrow: "// TOPICS · MENTIONED MOST",
    sourceLabelMap: {
      "skills.sh": "SKLSH",
      "github": "GH",
      "GitHub": "GH",
    },
  });

  const topHeader = (
    <NewsTopHeaderV3
      routeTitle="SKILLS · TRENDING"
      liveLabel="LIVE · 30M"
      eyebrow={`// SKILLS · ${data.source.toUpperCase()} · ${freshness.ageLabel.toUpperCase()}`}
      meta={[
        {
          label: "TRACKED",
          value: data.combined.items.length.toLocaleString("en-US"),
        },
        {
          label: "SKLSH",
          value: data.skillsSh.items.length.toLocaleString("en-US"),
        },
        { label: "GH", value: data.github.items.length.toLocaleString("en-US") },
      ]}
      cards={cards}
      topStories={topStories}
      accent={SKILLS_ACCENT}
      caption={[
        "// LAYOUT compact-v1",
        "· 3-COL · 320 / 1FR / 1FR",
        "· DATA UNCHANGED",
      ]}
    />
  );

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
      fetchedAt={data.fetchedAt}
      freshnessStatus={freshness.status}
      ageLabel={freshness.ageLabel}
      metrics={[]}
      topSlot={topHeader}
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

