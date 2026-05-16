import type { Meta, StoryObj } from "@storybook/react";

import { GaugeStrip } from "./GaugeStrip";

const meta: Meta<typeof GaugeStrip> = {
  title: "UI/GaugeStrip",
  component: GaugeStrip,
  tags: ["autodocs"],
  argTypes: {
    cellWidth: { control: { type: "number", min: 4, max: 30 } },
    cellHeight: { control: { type: "number", min: 4, max: 30 } },
    gap: { control: { type: "number", min: 0, max: 8 } },
  },
};

export default meta;
type Story = StoryObj<typeof GaugeStrip>;

export const Consensus8Cell: Story = {
  args: {
    cells: [
      { state: "on", title: "HN · 124 mentions" },
      { state: "on" },
      { state: "on" },
      { state: "on" },
      { state: "on" },
      { state: "weak" },
      { state: "off" },
      { state: "off" },
    ],
  },
};

export const RepoDetail5Cell: Story = {
  args: {
    cells: [
      { state: "on" },
      { state: "on" },
      { state: "weak" },
      { state: "off" },
      { state: "off" },
    ],
  },
};

export const AllWeak: Story = {
  args: {
    cells: Array.from({ length: 8 }, () => ({ state: "weak" as const })),
  },
};
