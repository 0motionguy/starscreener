import type { Meta, StoryObj } from "@storybook/react";

import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "UI/Chip",
  component: Chip,
  tags: ["autodocs"],
  argTypes: {
    on: { control: "boolean" },
    tone: { control: { type: "select" }, options: ["default", "acc"] },
    swatch: { control: "color" },
    count: { control: "text" },
    disabled: { control: "boolean" },
    as: { control: { type: "select" }, options: ["button", "span"] },
  },
  args: {
    children: "ALL",
    on: false,
    tone: "default",
  },
};

export default meta;
type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  args: { children: "ALL" },
};

export const On: Story = {
  args: { children: "ALL", on: true },
};

export const AccentOn: Story = {
  args: { children: "24H", tone: "acc", on: true },
};

export const WithCount: Story = {
  args: { children: "REPOS", on: true, count: 42 },
};

export const WithSwatch: Story = {
  args: { children: "HN", swatch: "var(--v4-src-hn)" },
};

export const Disabled: Story = {
  args: { children: "BREAKOUTS", disabled: true },
};

export const FilterStrip: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <Chip on>ALL</Chip>
      <Chip swatch="#ff7a00">HN</Chip>
      <Chip swatch="#1da1f2">TWITTER</Chip>
      <Chip swatch="#7c3aed">REDDIT</Chip>
      <Chip swatch="#22c55e">DEVTO</Chip>
      <Chip swatch="#0ea5e9">BSKY</Chip>
    </div>
  ),
};

export const TimeWindow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 6 }}>
      <Chip tone="acc" on>1H</Chip>
      <Chip tone="acc">24H</Chip>
      <Chip tone="acc">7D</Chip>
      <Chip tone="acc">30D</Chip>
    </div>
  ),
};

export const WithCounts: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <Chip on count={128}>REPOS</Chip>
      <Chip count={42}>BREAKOUTS</Chip>
      <Chip count={9}>NEW</Chip>
      <Chip count="1.2k">MENTIONS</Chip>
    </div>
  ),
};
