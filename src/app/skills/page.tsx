import type { Metadata } from "next";
import Link from "next/link";

import {
  SignalSourcePage,
  type SignalTabSpec,
} from "@/components/signal/SignalSourcePage";
import {
  getSkillsSignalData,
  type EcosystemBoard,
} from "@/lib/ecosystem-leaderboards";
import { classifyFreshness, findOldestRecordAt } from "@/lib/news/freshness";
import { absoluteUrl } from "@/lib/seo";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildEcosystemHeader } from "@/components/signal/ecosystemTopHeader";
import { SkillsTerminalTable, type SkillSourceFilter } from "@/components/skills/SkillsTerminalTable";

const SKILLS_ACCENT = "rgba(167, 139, 250, 0.85)";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  // Per-record floor: if the underlying rows haven't refreshed in 2× the cron
  // cadence, force STALE/COLD even when the top-level fetchedAt advanced.
  // The writer (_data-store-write.mjs) stamps `lastRefreshedAt` on every
  // tracked-repo record; missing rows fall through to fetchedAt-only.
  const oldestRecordAt = findOldestRecordAt(data.combined.items);
  const freshness = classifyFreshness(
    "skills",
    data.fetchedAt,
    undefined,
    oldestRecordAt,
  );

  // Sub-leaderboard datasets: same source list, different sort/filter.
  const items = data.combined.items;
  const now = Date.now();

  // 1. Hottest This Week — rank by Δhotness (current - 7d-prior) when EITHER
  //    side has a 7d-ago snapshot (cold-start: usually neither does, in which
  //    case all deltas collapse to 0 and we drop to the absolute fallback
  //    chain). Falls through to absolute hotness, then signalScore, then
  //    most-recently-pushed as the final tiebreak so day-1 ranking is useful
  //    instead of a flat list.
  const hottest = [...items]
    .sort((a, b) => {
      const aHasPrev = a.hotnessPrev7d !== undefined;
      const bHasPrev = b.hotnessPrev7d !== undefined;
      if (aHasPrev || bHasPrev) {
        const aDelta = (a.hotness ?? 0) - (a.hotnessPrev7d ?? a.hotness ?? 0);
        const bDelta = (b.hotness ?? 0) - (b.hotnessPrev7d ?? b.hotness ?? 0);
        if (aDelta !== bDelta) return bDelta - aDelta;
      }
      const aH = a.hotness ?? a.signalScore ?? 0;
      const bH = b.hotness ?? b.signalScore ?? 0;
      if (aH !== bH) return bH - aH;
      return (
        (Date.parse(b.lastPushedAt ?? "") || 0) -
        (Date.parse(a.lastPushedAt ?? "") || 0)
      );
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  // 2. Most Forked This Week — primary sort is forkVelocity7d (delta from
  //    7d-prior snapshot). Cold-start: nobody has a snapshot yet so velocity
  //    is uniformly undefined; in that case fall back to absolute `forks`
  //    desc so the most-forked repos still surface. Final tiebreak: most-
  //    recent push wins (so dormant whales sink under live activity).
  const mostForked = [...items]
    .sort((a, b) => {
      const aVel = a.forkVelocity7d;
      const bVel = b.forkVelocity7d;
      if (aVel !== undefined && bVel !== undefined && aVel !== bVel) {
        return bVel - aVel;
      }
      if (aVel !== undefined && bVel === undefined) return -1;
      if (aVel === undefined && bVel !== undefined) return 1;
      const aF = a.forks ?? 0;
      const bF = b.forks ?? 0;
      if (aF !== bF) return bF - aF;
      return (
        (Date.parse(b.lastPushedAt ?? "") || 0) -
        (Date.parse(a.lastPushedAt ?? "") || 0)
      );
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  // 3. New This Week — items where createdAt is within the last 7 days.
  //    Falls back to lastPushedAt when createdAt isn't on the payload.
  const newThisWeek = items
    .filter((item) => {
      const iso = item.createdAt ?? item.lastPushedAt;
      if (!iso) return false;
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return false;
      return now - t <= ONE_WEEK_MS;
    })
    .sort((a, b) => {
      const at = Date.parse(a.createdAt ?? a.lastPushedAt ?? "") || 0;
      const bt = Date.parse(b.createdAt ?? b.lastPushedAt ?? "") || 0;
      return bt - at;
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  // 4. Most Adopted in Collections — primary sort is derivativeRepoCount
  //    desc. Cold-start: derivative-count fetcher publishes every 12h and
  //    may not have run yet; rows without a count fall through to
  //    signalScore desc, then most-recently-pushed, so day-1 still produces
  //    a useful ranking instead of a flat list.
  const mostAdopted = [...items]
    .sort((a, b) => {
      const aD = a.derivativeRepoCount;
      const bD = b.derivativeRepoCount;
      if (aD !== undefined && bD !== undefined && aD !== bD) {
        return bD - aD;
      }
      if (aD !== undefined && bD === undefined) return -1;
      if (aD === undefined && bD !== undefined) return 1;
      const aS = a.signalScore ?? 0;
      const bS = b.signalScore ?? 0;
      if (aS !== bS) return bS - aS;
      return (
        (Date.parse(b.lastPushedAt ?? "") || 0) -
        (Date.parse(a.lastPushedAt ?? "") || 0)
      );
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

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

  // Single source-filter passed to all four tabs as a secondary control.
  // We surface it via the search-param pattern that SignalSourcePage already
  // uses — read it server-side so the rendered table is correct on first
  // paint. Default = "all".
  const sourceFilter: SkillSourceFilter = "all";

  const tabs: SignalTabSpec[] = [
    {
      id: "hottest",
      label: "Hottest This Week",
      rows: [],
      content: (
        <SkillsTerminalTable
          items={hottest}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="No skills leaderboard rows have landed yet."
          emptySubtitle="Waiting for the publish-leaderboards job to write trending-skill."
        />
      ),
    },
    {
      id: "most-forked",
      label: "Most Forked This Week",
      rows: [],
      content: (
        <SkillsTerminalTable
          items={mostForked}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="No fork velocity yet."
          emptySubtitle="forkVelocity7d is typed but not yet populated by an upstream fetcher."
        />
      ),
    },
    {
      id: "new",
      label: "New This Week",
      rows: [],
      content: (
        <SkillsTerminalTable
          items={newThisWeek}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="No new skills landed this week."
          emptySubtitle="Falls back to lastPushedAt when createdAt isn't on the payload."
        />
      ),
    },
    {
      id: "most-adopted",
      label: "Most Adopted in Collections",
      rows: [],
      content: (
        <SkillsTerminalTable
          items={mostAdopted}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="No derivative-count data yet."
          emptySubtitle="skill-derivative-count fetcher publishes every 12h."
        />
      ),
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
                <MomentumBar value={item.signalScore} />
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

// Tiny inline momentum bar, mirrors the HF/arXiv pages' MomentumBar shape so
// the visual language is consistent across all four trending domains.
const SKILLS_BAR_ACCENT = "rgba(167, 139, 250, 0.85)";
function MomentumBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      aria-label={`Momentum ${pct}`}
      className="inline-block"
      style={{
        width: 28,
        height: 6,
        background: "var(--v3-bg-100)",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <span
        className="block"
        style={{
          width: `${pct}%`,
          height: "100%",
          background: SKILLS_BAR_ACCENT,
          boxShadow: pct > 0 ? `0 0 4px ${SKILLS_BAR_ACCENT}66` : undefined,
        }}
      />
    </span>
  );
}

