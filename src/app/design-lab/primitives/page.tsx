// V4 design-lab — primitive showcase.
//
// Renders every V4 primitive with example props for visual review. Used:
//   - During Phase 1 verification (curl + grep selectors to prove they
//     hit the rendered DOM, not just the CSS bundle).
//   - As an internal reference while Phase 2 worktrees consume the
//     primitives.
//
// NOT linked from the sidebar. Path is `_design-lab` so Next.js treats
// it as a private/dev route. Will be removed (or moved to Storybook)
// before final ship.

import type { ReactNode } from "react";

import { CornerDots } from "@/components/ui/CornerDots";
import { LiveDot } from "@/components/ui/LiveDot";
import { PanelHead } from "@/components/ui/PanelHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { PageHead } from "@/components/ui/PageHead";
import { Chip } from "@/components/ui/Chip";
import { ChipGroup, FilterBar } from "@/components/ui/ChipGroup";
import { TabBar } from "@/components/ui/TabBar";
import { SourcePip } from "@/components/ui/SourcePip";
import { GaugeStrip } from "@/components/ui/GaugeStrip";
import { KpiBand } from "@/components/ui/KpiBand";
import { RankRow } from "@/components/ui/RankRow";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { MoverRow } from "@/components/funding/MoverRow";
import { ARRClimberRow } from "@/components/funding/ARRClimberRow";
import { DealTapeRow } from "@/components/funding/DealTapeRow";
import { StockRow } from "@/components/funding/StockSparkline";
import { SectorHeatmap } from "@/components/funding/SectorHeatmap";
import { ToolTile } from "@/components/tools/ToolTile";
import { MiniListCard } from "@/components/tools/MiniListCard";
import { Treemap } from "@/components/tools/Treemap";
import { CategoryPanel } from "@/components/home/CategoryPanel";
import { MentionRow } from "@/components/repo-detail/MentionRow";
import { RelatedRepoCard } from "@/components/repo-detail/RelatedRepoCard";
import { ChannelHeatStrip } from "@/components/breakouts/ChannelHeatStrip";
import { AlertBadge } from "@/components/alerts/AlertBadge";
import { AlertTriggerCard } from "@/components/alerts/AlertTriggerCard";
import { AlertEventRow } from "@/components/alerts/AlertEventRow";
import { AlertInbox } from "@/components/alerts/AlertInbox";

import type { AlertRule, AlertEvent } from "@/lib/pipeline/types";

// Disallow indexing — this is an internal review surface.
export const metadata = {
  robots: { index: false, follow: false },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <SectionHead num="//" title={title} />
      <div
        style={{
          padding: 16,
          border: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-025)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}

const SAMPLE_RULE: AlertRule = {
  id: "rule-1",
  userId: "local",
  repoId: "anthropic/claude-code",
  categoryId: null,
  trigger: "star_spike",
  threshold: 100,
  cooldownMinutes: 60,
  enabled: true,
  createdAt: "2026-04-30T00:00:00Z",
  lastFiredAt: null,
};

const SAMPLE_EVENT: AlertEvent = {
  id: "evt-1",
  ruleId: "rule-1",
  repoId: "anthropic/claude-code",
  userId: "local",
  trigger: "star_spike",
  title: "+824 stars in 24h",
  body: "anthropic/claude-code crossed your 500-star threshold.",
  url: "/repo/anthropic/claude-code",
  firedAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  readAt: null,
  conditionValue: 824,
  threshold: 500,
};

export default function DesignLabPrimitivesPage() {
  return (
    <main
      data-v4-design-lab="primitives"
      style={{ padding: "16px 24px 60px", maxWidth: 1280, margin: "0 auto" }}
    >
      <PageHead
        crumb={
          <>
            <b>DESIGN-LAB</b> · V4 PRIMITIVES · /_design-lab/primitives
          </>
        }
        h1="V4 (CORPUS) Primitives"
        lede="Every V4 primitive rendered with example props. Used by Phase 1 verification + as a reference while Phase 2 worktrees consume the contract."
      />

      <Section title="Chrome">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <CornerDots />
          <LiveDot />
          <LiveDot tone="amber" label="STALE" />
          <LiveDot tone="red" label="DOWN" />
          <LiveDot tone="none" label="—" />
        </div>
        <PanelHead k="// 01 SIGNAL VOLUME" sub="STACKED · 24H" right={<LiveDot label="LIVE" />} />
      </Section>

      <Section title="Filters">
        <FilterBar>
          <ChipGroup label="SOURCES">
            <Chip on swatch="var(--v4-src-hn)">HN</Chip>
            <Chip on swatch="var(--v4-src-gh)">GH</Chip>
            <Chip swatch="var(--v4-src-x)">X</Chip>
          </ChipGroup>
          <ChipGroup divider />
          <ChipGroup label="WINDOW">
            <Chip>1H</Chip>
            <Chip on tone="acc">24H</Chip>
            <Chip>7D</Chip>
          </ChipGroup>
        </FilterBar>
        <TabBar
          items={[
            { id: "all", label: "ALL", count: 14 },
            { id: "hn", label: "HN", count: 3 },
            { id: "rdt", label: "REDDIT", count: 5 },
          ]}
          active="hn"
        />
      </Section>

      <Section title="Data display">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SourcePip src="hn" />
          <SourcePip src="gh" />
          <SourcePip src="x" />
          <SourcePip src="reddit" />
          <SourcePip src="bsky" />
          <SourcePip src="dev" />
          <SourcePip src="claude" />
          <SourcePip src="openai" />
        </div>
        <GaugeStrip
          cells={[
            { state: "on" },
            { state: "on" },
            { state: "on" },
            { state: "weak" },
            { state: "off" },
            { state: "off" },
            { state: "off" },
            { state: "off" },
          ]}
        />
        <KpiBand
          cells={[
            {
              label: "Signal volume · 24h",
              value: "42,184",
              delta: "+18.2%",
              sub: "vs prev 24h",
            },
            { label: "Sources · live", value: "8 / 8", sub: <LiveDot label="all healthy" /> },
            {
              label: "Top tag",
              value: "#claude-skills",
              tone: "acc",
              sub: "+312% · 6,401 mentions",
            },
            { label: "Data freshness", value: "1m 12s", tone: "money" },
          ]}
        />
        <RankRow
          rank={1}
          title="anthropic/claude-code"
          desc="Agentic coding tool that lives in your terminal"
          metric={{ value: "4.81", label: "/ 5.0" }}
          delta={{ value: "+18%", direction: "up" }}
          first
        />
        <VerdictRibbon
          tone="money"
          stamp={{
            eyebrow: "// TODAY'S TAPE",
            headline: "30 APR · 06:29 UTC",
            sub: "computed 2m ago · 142 deals · 24h",
          }}
          text={
            <>
              <b>$4.82B raised</b> across 142 deals in the last 24h — up{" "}
              <b style={{ color: "var(--v4-money)" }}>+38% week-over-week</b>.
            </>
          }
        />
      </Section>

      <Section title="Funding">
        <MoverRow rank={1} name="Anthropic" meta="Lightspeed-led · $61.5B post" amount="$2.0B" stage="Series F" first />
        <ARRClimberRow rank={1} name="Cursor" meta="dev tools · @anysphere" arr="$140M" momPct={18} />
        <DealTapeRow ts="06:24" title={<><b>Anthropic</b> raises $2.0B Series F</>} amount="$2.0B" sourceCode="BB" stage="SERIES F" fresh />
        <StockRow ticker="NVDA" name="NVIDIA" price="112.4" change="+2.4%" direction="up" pipColor="var(--v4-money)" />
        <SectorHeatmap
          stages={["SEED", "A", "B", "C", "D+", "GROWTH"]}
          sectors={[
            {
              key: "agents",
              label: "AI · agents",
              pip: "var(--v4-violet)",
              values: [120, 480, 920, 2400, 3800, 2200],
              total: "$10.1B",
            },
            {
              key: "infra",
              label: "AI · infra",
              pip: "var(--v4-money)",
              values: [80, 320, 480, 1100, 1800, 1400],
              total: "$5.2B",
            },
          ]}
        />
      </Section>

      <Section title="Tools">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <ToolTile
            num="// 01 · NEW"
            title="Star History"
            desc="Plot multiple repos head-to-head."
            active
          />
          <ToolTile num="// 02" title="Mindshare Map" desc="Bubble-chart of trending repos." />
        </div>
        <MiniListCard
          icon="✦"
          title="TOP 10 · LLMS"
          badge="7D"
          items={[
            { name: "Claude Sonnet 4.5", value: "4.92" },
            { name: "GPT-5", value: "4.71" },
          ]}
        />
        <Treemap
          width={400}
          height={120}
          cells={[
            { x: 0, y: 0, w: 200, h: 120, color: "var(--v4-cyan)", label: "AI", sub: "hermes-a", big: true },
            { x: 200, y: 0, w: 100, h: 60, color: "var(--v4-acc)", label: "AGENT", sub: "rtk" },
            { x: 200, y: 60, w: 100, h: 60, color: "var(--v4-violet)", label: "MCP", sub: "cc-switch" },
            { x: 300, y: 0, w: 100, h: 120, color: "var(--v4-money)", label: "INFRA", sub: "vllm" },
          ]}
        />
      </Section>

      <Section title="Home / repo-detail">
        <CategoryPanel title="REPOS · TOP GAINERS" pip="var(--v4-acc)" count="3 / 1,247">
          <RankRow rank={1} title="anthropic/claude-code" delta={{ value: "+564", direction: "up" }} first />
          <RankRow rank={2} title="getcursor/cursor" delta={{ value: "+260", direction: "up" }} />
          <RankRow rank={3} title="meta-llama/llama-4" delta={{ value: "+210", direction: "up" }} />
        </CategoryPanel>
        <MentionRow
          source="hn"
          author="lucasronin"
          handle="@lucasronin"
          ts="2d ago · APR 28"
          body={
            <>
              After two years of side-project iteration I&apos;m finally shipping{" "}
              <strong>refactoringhq/tolaria</strong> — a Tauri-based desktop client.
            </>
          }
          stats={[
            { label: "▲ 412 points", emphasis: "up" },
            { label: "💬 184 comments" },
            { label: "↑ #4 front-page", emphasis: "up" },
          ]}
          url="news.ycombinator.com/item?id=39842…"
          href="https://news.ycombinator.com"
        />
        <RelatedRepoCard
          fullName="abhigyanpatwari/GitNexus"
          description="The Zero-Server Code Intelligence Engine — wikilinks for source repos."
          language="TYPESCRIPT"
          stars="22.2K"
          similarity="SIM 0.86"
        />
        <ChannelHeatStrip
          hours={[0, 0, 0, 1, 1, 1, 2, 2, 1, 2, 3, 3, 2, 3, 3, 3, 2, 2, 1, 1, 0, 1, 0, 0]}
        />
      </Section>

      <Section title="Alerts">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <AlertBadge count={3} />
          <AlertBadge count={156} tone="red" />
          <AlertBadge count={1} tone="money" compact />
        </div>
        <AlertTriggerCard rule={SAMPLE_RULE} repoLabel="anthropic/claude-code" />
        <AlertEventRow event={SAMPLE_EVENT} ago="4h ago" repoLabel="anthropic/claude-code" />
        <AlertInbox events={[SAMPLE_EVENT]} formatAge={() => "4H"} />
      </Section>
    </main>
  );
}
