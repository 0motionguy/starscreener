import type { Meta, StoryObj } from "@storybook/react";

import { KpiBand } from "./KpiBand";
import { LiveDot } from "./LiveDot";

const meta: Meta<typeof KpiBand> = {
  title: "UI/KpiBand",
  component: KpiBand,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof KpiBand>;

export const Signals: Story = {
  render: () => (
    <KpiBand
      cells={[
        {
          label: "Signal volume · 24h",
          value: "42,184",
          delta: "+18.2%",
          sub: "vs prev 24h",
        },
        {
          label: "Sources · live",
          value: "8 / 8",
          sub: <LiveDot label="all healthy" />,
        },
        {
          label: "Top tag",
          value: "#claude-skills",
          tone: "acc",
          sub: (
            <span style={{ color: "var(--v4-money, #22c55e)" }}>
              +312% · 6,401
            </span>
          ),
        },
        {
          label: "Data freshness",
          value: "1m 12s",
          tone: "money",
          sub: "→ realtime",
          pip: "var(--v4-acc)",
        },
      ]}
    />
  ),
};

export const Funding: Story = {
  render: () => (
    <KpiBand
      cells={[
        { label: "Capital · 7d", value: "$2.1B", tone: "money", delta: "+12.4%" },
        { label: "Deals · 7d", value: "284", sub: "vs 251 prev" },
        { label: "Top stage", value: "Series A", sub: "37 deals" },
        { label: "Top sector", value: "AI infra", tone: "acc", sub: "$612M" },
        { label: "Median size", value: "$8M" },
      ]}
    />
  ),
};

export const Compact3: Story = {
  render: () => (
    <KpiBand
      cells={[
        { label: "Stars · 24h", value: "+842", tone: "money" },
        { label: "Rank", value: "#3", tone: "acc" },
        { label: "Signal", value: "HOT", tone: "amber", pip: "#f59e0b" },
      ]}
    />
  ),
};

export const RedAlert: Story = {
  render: () => (
    <KpiBand
      cells={[
        { label: "Errors · 1h", value: "127", tone: "red", delta: "+340%" },
        { label: "p95 latency", value: "8.2s", tone: "red" },
        { label: "Health", value: "DEGRADED", tone: "red", pip: "#ef4444" },
      ]}
    />
  ),
};
