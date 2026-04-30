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

export const revalidate = 600;

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

  // (Phase-5 escalation 2026-04-29) Old `mostForked` / `newThisWeek` /
  // `mostAdopted` arrays removed when the four-tab UI was replaced with
  // three (All Time / Trending 24h / Hot). The signals they surfaced
  // (forkVelocity7d, createdAt, derivativeRepoCount) are still on the
  // EcosystemLeaderboardItem and consumed by other surfaces.

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

  // Phase-5 escalation 2026-04-29: replaced 4 weekly-themed tabs with 3
  // user-facing tabs that match the reference UI (All Time / Trending 24h
  // / Hot). The underlying sort comparators stay (hottest = Δhotness with
  // absolute fallback chain; mostForked/mostAdopted retired since their
  // signal isn't surfaced as a tab anymore).
  //
  // 1. All Time — sort by popularity desc (installs > downloads > stars per
  //    coercer priority); falls through to signalScore. Counts upstream
  //    pagination.total when present (e.g. skillsmp 1M+ catalog).
  const allTime = [...items]
    .sort((a, b) => {
      const aP = a.popularity ?? a.signalScore ?? 0;
      const bP = b.popularity ?? b.signalScore ?? 0;
      if (aP !== bP) return bP - aP;
      return (
        (Date.parse(b.lastPushedAt ?? "") || 0) -
        (Date.parse(a.lastPushedAt ?? "") || 0)
      );
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  // 2. Trending (24h) — Δhotness (current - prev) when at least one side
  //    has a 7d-prior snapshot. Cold-start fallback chain hottest → above.
  //    Reuses the `hottest` array built earlier in this file.
  const trending24h = hottest;

  // 3. Hot — items pushed in the last 7d, ranked by absolute hotness desc.
  //    Surfaces "what's actively churning" without needing a 1h-snapshot
  //    fetcher (defer that until snapshots ship in a follow-up).
  const hotRecent = items
    .filter((item) => {
      const iso = item.lastPushedAt ?? item.createdAt;
      if (!iso) return false;
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return false;
      return now - t <= ONE_WEEK_MS;
    })
    .sort((a, b) => {
      const aH = a.hotness ?? a.signalScore ?? 0;
      const bH = b.hotness ?? b.signalScore ?? 0;
      if (aH !== bH) return bH - aH;
      return (
        (Date.parse(b.lastPushedAt ?? "") || 0) -
        (Date.parse(a.lastPushedAt ?? "") || 0)
      );
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const totalLabel =
    typeof data.combined.meta?.total === "number" && data.combined.meta.total > 0
      ? data.combined.meta.total.toLocaleString("en-US")
      : data.combined.items.length.toLocaleString("en-US");

  const tabs: SignalTabSpec[] = [
    {
      id: "all-time",
      label: `All Time (${totalLabel})`,
      rows: [],
      content: (
        <SkillsTerminalTable
          items={allTime}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="No skills leaderboard rows have landed yet."
          emptySubtitle="Waiting for upstream skill fetchers to populate Redis."
        />
      ),
    },
    {
      id: "trending-24h",
      label: "Trending (24h)",
      rows: [],
      content: (
        <SkillsTerminalTable
          items={trending24h}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="No 24h trending data yet."
          emptySubtitle="Cold-start: ranking falls back to absolute hotness until 7d-prior snapshots fill in."
        />
      ),
    },
    {
      id: "hot",
      label: "Hot",
      rows: [],
      content: (
        <SkillsTerminalTable
          items={hotRecent}
          accent={SKILLS_ACCENT}
          sourceFilter={sourceFilter}
          emptyTitle="Nothing pushed in the last 7d."
          emptySubtitle="Hot tab surfaces actively-churning skills."
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

