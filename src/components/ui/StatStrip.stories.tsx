import type { Meta, StoryObj } from "@storybook/react";

import { StatStrip } from "./StatStrip";

const meta: Meta<typeof StatStrip> = {
  title: "UI/StatStrip",
  component: StatStrip,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof StatStrip>;

export const Skills: Story = {
  render: () => (
    <StatStrip
      eyebrow="// SKILLS · LIVE INDEX"
      status="1,432 ITEMS · 24H"
      stats={[
        { label: "TOTAL", value: "1,432" },
        { label: "NEW · 24H", value: "+38", tone: "up", hint: "vs 26 prev" },
        { label: "TOP CATEGORY", value: "agents", tone: "accent" },
        { label: "AVG STARS", value: "412" },
      ]}
    />
  ),
};

export const Funding: Story = {
  render: () => (
    <StatStrip
      eyebrow="// FUNDING · 7D ROLLING"
      status="$2.1B · 284 DEALS"
      stats={[
        { label: "CAPITAL", value: "$2.1B", tone: "up" },
        { label: "DEALS", value: "284", tone: "up", hint: "+13.1%" },
        { label: "MEDIAN SIZE", value: "$8M" },
        { label: "TOP SECTOR", value: "AI infra", tone: "accent" },
        { label: "MEGA ROUNDS", value: "12", hint: "≥$100M" },
      ]}
    />
  ),
};

export const RedSignal: Story = {
  render: () => (
    <StatStrip
      eyebrow="// SIGNAL HEALTH · 1H"
      status="DEGRADED"
      stats={[
        { label: "ERRORS", value: "127", tone: "down", hint: "+340%" },
        { label: "P95", value: "8.2s", tone: "down" },
        { label: "OK CHECKS", value: "12 / 18", tone: "down" },
        { label: "LAST GREEN", value: "47m ago" },
      ]}
    />
  ),
};
