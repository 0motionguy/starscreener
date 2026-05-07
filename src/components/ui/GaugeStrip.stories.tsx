import type { Meta, StoryObj } from "@storybook/react";

import { GaugeStrip } from "./GaugeStrip";

const meta: Meta<typeof GaugeStrip> = {
  title: "UI/GaugeStrip",
  component: GaugeStrip,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof GaugeStrip>;

export const ConsensusFull: Story = {
  render: () => (
    <GaugeStrip
      cells={[
        { state: "on", title: "HN · 124 mentions" },
        { state: "on", title: "GH · viral" },
        { state: "on", title: "X · 412 reposts" },
        { state: "on", title: "Reddit · 87 mentions" },
        { state: "on", title: "Bsky · 38 mentions" },
        { state: "weak", title: "DevTo · 4 posts" },
        { state: "weak", title: "Lobsters · 2 posts" },
        { state: "off", title: "ProductHunt · no signal" },
      ]}
    />
  ),
};

export const ConsensusMixed: Story = {
  render: () => (
    <GaugeStrip
      cells={[
        { state: "on" },
        { state: "on" },
        { state: "weak" },
        { state: "weak" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
      ]}
    />
  ),
};

export const FiveCell: Story = {
  render: () => (
    <GaugeStrip
      cells={[
        { state: "on", title: "GH" },
        { state: "on", title: "HN" },
        { state: "on", title: "X" },
        { state: "weak", title: "Reddit" },
        { state: "off", title: "Bsky" },
      ]}
    />
  ),
};

export const SoloOn: Story = {
  render: () => (
    <GaugeStrip
      cells={[
        { state: "on", title: "GH only" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
        { state: "off" },
      ]}
    />
  ),
};

export const Tall: Story = {
  render: () => (
    <GaugeStrip
      cellWidth={16}
      cellHeight={28}
      gap={3}
      cells={[
        { state: "on" },
        { state: "on" },
        { state: "on" },
        { state: "on" },
        { state: "weak" },
        { state: "weak" },
        { state: "off" },
        { state: "off" },
      ]}
    />
  ),
};
