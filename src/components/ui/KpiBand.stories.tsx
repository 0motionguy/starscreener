import type { Meta, StoryObj } from "@storybook/react";

import { KpiBand } from "./KpiBand";

const meta: Meta<typeof KpiBand> = {
  title: "UI/KpiBand",
  component: KpiBand,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof KpiBand>;

export const Default: Story = {
  args: {
    cells: [
      {
        label: "Signal volume · 24h",
        value: "42,184",
        delta: "+18.2%",
        sub: "vs prev 24h",
      },
      {
        label: "Sources · live",
        value: "8 / 8",
        sub: "all healthy",
      },
      {
        label: "Top tag",
        value: "#claude-skills",
        tone: "acc",
        sub: "+312% · 6,401",
      },
      {
        label: "Data freshness",
        value: "1m 12s",
        tone: "money",
        sub: "→ realtime",
        pip: "var(--v4-acc, #ff6a00)",
      },
    ],
  },
};

export const SingleCell: Story = {
  args: {
    cells: [
      {
        label: "Total tracked repos",
        value: "1,247",
        tone: "default",
        sub: "across 8 sources",
      },
    ],
  },
};
