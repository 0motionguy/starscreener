import type { Meta, StoryObj } from "@storybook/react";

import { Metric, MetricGrid } from "./Metric";

const TONES = [
  "neutral",
  "accent",
  "positive",
  "negative",
  "warning",
  "consensus",
  "early",
  "divergence",
  "external",
] as const;

const meta: Meta<typeof Metric> = {
  title: "UI/Metric",
  component: Metric,
  tags: ["autodocs"],
  argTypes: {
    tone: { control: { type: "select" }, options: TONES },
    pip: { control: "boolean" },
    live: { control: "boolean" },
  },
  args: {
    label: "stars",
    value: "12.4k",
    tone: "neutral",
  },
};

export default meta;
type Story = StoryObj<typeof Metric>;

export const Neutral: Story = {
  args: { label: "stars", value: "12.4k", tone: "neutral" },
};

export const Accent: Story = {
  args: { label: "rank", value: "#3", tone: "accent" },
};

export const PositiveWithDelta: Story = {
  args: {
    label: "24h",
    value: "+842",
    delta: "+6.8%",
    tone: "positive",
  },
};

export const NegativeWithSub: Story = {
  args: {
    label: "drift",
    value: "-12",
    sub: "vs 7d avg",
    tone: "negative",
  },
};

export const LiveWithPip: Story = {
  args: {
    label: "stars/min",
    value: "47",
    tone: "consensus",
    pip: true,
    live: true,
  },
};

export const Grid6: Story = {
  render: () => (
    <MetricGrid columns={6}>
      <Metric label="stars" value="12.4k" tone="neutral" />
      <Metric label="forks" value="894" tone="neutral" />
      <Metric label="24h" value="+842" delta="+6.8%" tone="positive" />
      <Metric label="rank" value="#3" tone="accent" />
      <Metric label="signal" value="hot" tone="early" pip />
      <Metric label="drift" value="-12" tone="negative" />
    </MetricGrid>
  ),
};

export const Grid4: Story = {
  render: () => (
    <MetricGrid columns={4}>
      <Metric label="stars" value="12.4k" tone="neutral" />
      <Metric label="24h" value="+842" tone="positive" />
      <Metric label="rank" value="#3" tone="accent" />
      <Metric label="signal" value="hot" tone="early" pip live />
    </MetricGrid>
  ),
};

export const AllTones: Story = {
  render: () => (
    <MetricGrid columns={5}>
      {TONES.map((tone) => (
        <Metric key={tone} label={tone} value="42" tone={tone} />
      ))}
    </MetricGrid>
  ),
};
