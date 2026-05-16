import type { Meta, StoryObj } from "@storybook/react";

import { VerdictRibbon } from "./VerdictRibbon";

const meta: Meta<typeof VerdictRibbon> = {
  title: "UI/VerdictRibbon",
  component: VerdictRibbon,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    tone: {
      control: { type: "select" },
      options: ["acc", "money", "amber"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof VerdictRibbon>;

export const Accent: Story = {
  args: {
    tone: "acc",
    stamp: {
      eyebrow: "// STAMP",
      headline: "28 APR · 06:29 UTC",
      sub: "computed 4m ago",
    },
    text: (
      <>
        14 <b>strong consensus picks</b> today led by anthropic/skills (8/8) and
        openai/python.
      </>
    ),
    actionHref: "/consensus/methodology",
    actionLabel: "METHODOLOGY",
  },
};

export const Money: Story = {
  args: {
    tone: "money",
    stamp: {
      eyebrow: "// TODAY'S TAPE",
      headline: "28 APR · 06:29 UTC",
      sub: "computed 2m ago · 142 deals · 24h",
    },
    text: (
      <>
        $<b>4.82B raised</b> across 142 deals in the last 24h.
      </>
    ),
    actionHref: "/funding/methodology",
    actionLabel: "METHODOLOGY",
  },
};

export const Amber: Story = {
  args: {
    tone: "amber",
    stamp: {
      eyebrow: "// STALE",
      headline: "28 APR · 06:29 UTC",
      sub: "last sync 47m ago",
    },
    text: <>Signal layer is operating on cached data — verdicts may lag.</>,
  },
};
