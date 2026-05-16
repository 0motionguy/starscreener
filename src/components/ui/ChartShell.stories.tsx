import type { Meta, StoryObj } from "@storybook/react";

import {
  ChartLegend,
  ChartShell,
  ChartStat,
  ChartStats,
  ChartWrap,
} from "./ChartShell";

const meta: Meta<typeof ChartShell> = {
  title: "UI/ChartShell",
  component: ChartShell,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["chart", "map", "matrix", "heatmap", "market", "treemap"],
    },
    as: {
      control: { type: "select" },
      options: ["section", "div"],
    },
  },
  args: {
    variant: "chart",
    as: "section",
  },
};

export default meta;
type Story = StoryObj<typeof ChartShell>;

export const Default: Story = {
  args: {
    children: (
      <ChartWrap variant="chart">
        <div style={{ padding: 24, color: "var(--v4-ink-300, #8a8a8a)" }}>
          [chart canvas]
        </div>
      </ChartWrap>
    ),
  },
};

export const WithLegendAndStats: Story = {
  args: {
    variant: "market",
    children: (
      <>
        <ChartLegend variant="market" right={<span>24h</span>}>
          <span>Reddit</span>
          <span>HN</span>
          <span>Bluesky</span>
        </ChartLegend>
        <ChartWrap variant="market">
          <div style={{ padding: 24, color: "var(--v4-ink-300, #8a8a8a)" }}>
            [market canvas]
          </div>
        </ChartWrap>
        <ChartStats columns={4}>
          <ChartStat label="Signals" value="42,184" sub="+18.2%" />
          <ChartStat label="Sources" value="8 / 8" sub="all live" />
          <ChartStat label="Repos" value="1,247" sub="tracked" />
          <ChartStat label="Tag" value="claude-skills" sub="hot" />
        </ChartStats>
      </>
    ),
  },
};
