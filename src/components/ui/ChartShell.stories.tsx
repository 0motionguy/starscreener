import type { Meta, StoryObj } from "@storybook/react";

import {
  ChartShell,
  ChartWrap,
  ChartLegend,
  ChartStats,
  ChartStat,
} from "./ChartShell";

const VARIANTS = ["chart", "map", "matrix", "heatmap", "market", "treemap"] as const;

const meta: Meta<typeof ChartShell> = {
  title: "UI/ChartShell",
  component: ChartShell,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: { type: "select" }, options: VARIANTS },
  },
  args: { variant: "chart" },
};

export default meta;
type Story = StoryObj<typeof ChartShell>;

const Placeholder = ({ label }: { label: string }) => (
  <div
    style={{
      height: 220,
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--v4-mono, ui-monospace)",
      fontSize: 11,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "var(--v4-ink-300, #888)",
      border: "1px dashed var(--v4-line-200, #2a2a2a)",
      borderRadius: 2,
      background: "var(--v4-bg-050, #0a0a0a)",
    }}
  >
    {`// ${label}`}
  </div>
);

export const ChartFull: Story = {
  render: () => (
    <ChartShell variant="chart">
      <ChartLegend variant="chart" right={<span>last 24h</span>}>
        <span>stars/min</span>
      </ChartLegend>
      <ChartWrap variant="chart">
        <Placeholder label="line chart" />
      </ChartWrap>
      <ChartStats columns={4}>
        <ChartStat label="peak" value="142" sub="04:17 utc" />
        <ChartStat label="avg" value="48" />
        <ChartStat label="trough" value="3" sub="22:40 utc" />
        <ChartStat label="total" value="6.9k" />
      </ChartStats>
    </ChartShell>
  ),
};

export const Map: Story = {
  render: () => (
    <ChartShell variant="map">
      <ChartLegend variant="map">
        <span>signal map · last 7d</span>
      </ChartLegend>
      <ChartWrap variant="map">
        <Placeholder label="signal map" />
      </ChartWrap>
      <ChartStats columns={3}>
        <ChartStat label="repos" value="248" />
        <ChartStat label="signals" value="1.2k" />
        <ChartStat label="breakouts" value="14" />
      </ChartStats>
    </ChartShell>
  ),
};

export const Matrix: Story = {
  render: () => (
    <ChartShell variant="matrix">
      <ChartLegend variant="matrix">
        <span>cross-source agreement</span>
      </ChartLegend>
      <ChartWrap variant="matrix">
        <Placeholder label="agreement matrix" />
      </ChartWrap>
    </ChartShell>
  ),
};

export const Market: Story = {
  render: () => (
    <ChartShell variant="market">
      <ChartLegend variant="market" right={<span>15m delayed</span>}>
        <span>capital flow</span>
      </ChartLegend>
      <ChartWrap variant="market">
        <Placeholder label="market chart" />
      </ChartWrap>
      <ChartStats columns={5}>
        <ChartStat label="open" value="$2.4M" />
        <ChartStat label="high" value="$3.1M" />
        <ChartStat label="low" value="$2.2M" />
        <ChartStat label="close" value="$2.9M" />
        <ChartStat label="vol" value="42" />
      </ChartStats>
    </ChartShell>
  ),
};

export const StatsOnly: Story = {
  render: () => (
    <ChartStats columns={6}>
      <ChartStat label="stars" value="12.4k" />
      <ChartStat label="forks" value="894" />
      <ChartStat label="prs" value="42" />
      <ChartStat label="issues" value="128" />
      <ChartStat label="contribs" value="36" />
      <ChartStat label="age" value="2y" sub="since first commit" />
    </ChartStats>
  ),
};
