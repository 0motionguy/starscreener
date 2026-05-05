import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { ChipGroup, FilterBar } from "./ChipGroup";
import { CornerDots } from "./CornerDots";
import { DataList, DataRow } from "./DataList";
import { EntityLogo } from "./EntityLogo";
import { GaugeStrip } from "./GaugeStrip";
import { Input } from "./Input";
import { KpiBand } from "./KpiBand";
import { LiveDot } from "./LiveDot";
import { Metric, MetricGrid } from "./Metric";
import { PageHead } from "./PageHead";
import { PanelHead } from "./PanelHead";
import { RankRow } from "./RankRow";
import { SectionHead } from "./SectionHead";
import { SourcePip } from "./SourcePip";
import { StatStrip } from "./StatStrip";
import { TabBar } from "./TabBar";
import { VerdictRibbon } from "./VerdictRibbon";

const meta: Meta = {
  title: "UI/Library Coverage",
};

export default meta;
type Story = StoryObj;

export const BadgeDefault: Story = {
  render: () => <Badge tone="accent" count={7}>Signals</Badge>,
};

export const ButtonDefault: Story = {
  render: () => <Button variant="primary">Refresh Feed</Button>,
};

export const CardDefault: Story = {
  render: () => <Card variant="panel">Card content</Card>,
};

export const ChipDefault: Story = {
  render: () => <Chip on tone="acc">24H</Chip>,
};

export const ChipGroupDefault: Story = {
  render: () => (
    <FilterBar>
      <ChipGroup label="Sources">
        <Chip on>ALL</Chip>
        <Chip>HN</Chip>
      </ChipGroup>
    </FilterBar>
  ),
};

export const CornerDotsDefault: Story = {
  render: () => <CornerDots />,
};

export const DataListDefault: Story = {
  render: () => (
    <DataList header="Latest Mentions">
      <DataRow first>anthropic/claude-code</DataRow>
      <DataRow>openai/openai-python</DataRow>
    </DataList>
  ),
};

export const EntityLogoDefault: Story = {
  render: () => <EntityLogo name="Anthropic" size={32} />,
};

export const GaugeStripDefault: Story = {
  render: () => (
    <GaugeStrip cells={[{ state: "on" }, { state: "on" }, { state: "weak" }, { state: "off" }]} />
  ),
};

export const InputDefault: Story = {
  render: () => <Input placeholder="Search repositories" />,
};

export const KpiBandDefault: Story = {
  render: () => (
    <KpiBand
      cells={[
        { label: "Signal volume", value: "42,184", delta: "+18.2%", sub: "vs prev 24h" },
        { label: "Sources live", value: "8 / 8", sub: <LiveDot label="healthy" /> },
      ]}
    />
  ),
};

export const LiveDotDefault: Story = {
  render: () => <LiveDot label="LIVE" />,
};

export const MetricDefault: Story = {
  render: () => (
    <MetricGrid columns={4}>
      <Metric label="Score" value="4.82" sub="consensus" tone="accent" />
    </MetricGrid>
  ),
};

export const PageHeadDefault: Story = {
  render: () => (
    <PageHead crumb={<><b>HOME</b> · TERMINAL · /</>} h1="TrendingRepo" lede="Live ranking from multi-source signals." />
  ),
};

export const PanelHeadDefault: Story = {
  render: () => <PanelHead k="// 01 SIGNAL VOLUME" sub="STACKED · 24H" right={<LiveDot label="LIVE" />} />,
};

export const RankRowDefault: Story = {
  render: () => (
    <RankRow rank={1} title="anthropic/claude-code" desc="Agentic coding assistant" metric={{ value: "4.81", label: "/ 5.0" }} delta={{ value: "+18%", direction: "up" }} first />
  ),
};

export const SectionHeadDefault: Story = {
  render: () => <SectionHead num="// 01" title="Trending Now" meta="top 10" />,
};

export const SourcePipDefault: Story = {
  render: () => <SourcePip src="hn" />,
};

export const StatStripDefault: Story = {
  render: () => (
    <StatStrip
      eyebrow="// SIGNALS · LIVE INDEX"
      status="24H WINDOW"
      stats={[
        { label: "Mentions", value: "42,184", tone: "up" },
        { label: "Sources", value: "8 / 8", tone: "accent" },
      ]}
    />
  ),
};

export const TabBarDefault: Story = {
  render: () => (
    <TabBar
      items={[
        { id: "all", label: "ALL", count: 14 },
        { id: "hn", label: "HN", count: 3 },
      ]}
      active="all"
    />
  ),
};

export const VerdictRibbonDefault: Story = {
  render: () => (
    <VerdictRibbon
      tone="money"
      stamp={{ eyebrow: "// TODAY'S TAPE", headline: "05 MAY · 08:40 UTC", sub: "computed 2m ago" }}
      text={<><b>$4.82B raised</b> across 142 deals in the last 24h.</>}
    />
  ),
};
