import type { Meta, StoryObj } from "@storybook/react";

import { Metric, MetricGrid } from "./Metric";

const meta: Meta<typeof Metric> = {
  title: "UI/Metric",
  component: Metric,
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: { type: "select" },
      options: [
        "neutral",
        "accent",
        "positive",
        "negative",
        "warning",
        "consensus",
        "early",
        "divergence",
        "external",
      ],
    },
    pip: { control: "boolean" },
    live: { control: "boolean" },
  },
  args: {
    label: "Signals · 24h",
    value: "42,184",
    sub: "vs prev 24h",
    tone: "neutral",
  },
};

export default meta;
type Story = StoryObj<typeof Metric>;

export const Default: Story = {};

export const Positive: Story = {
  args: { tone: "positive", value: "+312%", delta: "▲ 6.4K", sub: "growth" },
};

export const LiveWithPip: Story = {
  args: { live: true, pip: true, value: "8 / 8", sub: "all healthy" },
};

export const Grid: Story = {
  render: () => (
    <MetricGrid columns={4}>
      <Metric label="Repos" value="1,247" sub="tracked" />
      <Metric label="Sources" value="8 / 8" tone="positive" live pip />
      <Metric label="Top tag" value="claude-skills" tone="accent" />
      <Metric label="Freshness" value="1m 12s" tone="consensus" sub="realtime" />
    </MetricGrid>
  ),
};
