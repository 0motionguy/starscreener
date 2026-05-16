import type { Meta, StoryObj } from "@storybook/react";

import { SectionHead } from "./SectionHead";

const meta: Meta<typeof SectionHead> = {
  title: "UI/SectionHead",
  component: SectionHead,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    as: {
      control: { type: "select" },
      options: ["h2", "h3"],
    },
  },
  args: {
    num: "// 01",
    title: "Trending now · top 7 by category",
    as: "h2",
  },
};

export default meta;
type Story = StoryObj<typeof SectionHead>;

export const Default: Story = {};

export const WithMeta: Story = {
  args: {
    num: "// 04",
    title: "Featured · curated this week",
    meta: (
      <>
        editor · <b>3</b> picks
      </>
    ),
  },
};

export const SubSection: Story = {
  args: {
    num: "// 04.2",
    title: "Sub-section",
    as: "h3",
  },
};
