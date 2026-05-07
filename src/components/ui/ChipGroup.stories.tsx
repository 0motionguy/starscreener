import type { Meta, StoryObj } from "@storybook/react";

import { ChipGroup, FilterBar } from "./ChipGroup";
import { Chip } from "./Chip";

const meta: Meta<typeof ChipGroup> = {
  title: "UI/ChipGroup",
  component: ChipGroup,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ChipGroup>;

export const Sources: Story = {
  render: () => (
    <ChipGroup label="SOURCES">
      <Chip on>ALL</Chip>
      <Chip swatch="#ff7a00">HN</Chip>
      <Chip swatch="#1da1f2">X</Chip>
      <Chip swatch="#7c3aed">REDDIT</Chip>
      <Chip swatch="#22c55e">DEV</Chip>
    </ChipGroup>
  ),
};

export const TimeWindow: Story = {
  render: () => (
    <ChipGroup label="WINDOW">
      <Chip tone="acc" on>1H</Chip>
      <Chip tone="acc">24H</Chip>
      <Chip tone="acc">7D</Chip>
      <Chip tone="acc">30D</Chip>
    </ChipGroup>
  ),
};

export const WithRightSlot: Story = {
  render: () => (
    <ChipGroup
      label="TOPIC"
      rightSlot={<span style={{ fontFamily: "ui-monospace", fontSize: 11 }}>42,184 signals · 24h</span>}
    >
      <Chip on>ALL</Chip>
      <Chip>AI/ML</Chip>
      <Chip>DEV TOOLS</Chip>
      <Chip>INFRA</Chip>
    </ChipGroup>
  ),
};

export const FullFilterBar: Story = {
  render: () => (
    <FilterBar>
      <ChipGroup label="SOURCES">
        <Chip on>ALL</Chip>
        <Chip swatch="#ff7a00">HN</Chip>
        <Chip swatch="#1da1f2">X</Chip>
        <Chip swatch="#7c3aed">REDDIT</Chip>
      </ChipGroup>
      <ChipGroup divider />
      <ChipGroup label="WINDOW">
        <Chip tone="acc">1H</Chip>
        <Chip tone="acc" on>24H</Chip>
        <Chip tone="acc">7D</Chip>
      </ChipGroup>
      <ChipGroup divider />
      <ChipGroup
        label="TOPIC"
        rightSlot={
          <span style={{ fontFamily: "ui-monospace", fontSize: 11 }}>
            42,184 signals
          </span>
        }
      >
        <Chip on>ALL</Chip>
        <Chip>AI/ML</Chip>
        <Chip>INFRA</Chip>
      </ChipGroup>
    </FilterBar>
  ),
};
