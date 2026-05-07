import type { Meta, StoryObj } from "@storybook/react";

import { SectionHead } from "./SectionHead";

const meta: Meta<typeof SectionHead> = {
  title: "UI/SectionHead",
  component: SectionHead,
  tags: ["autodocs"],
  argTypes: {
    as: { control: { type: "select" }, options: ["h2", "h3"] },
  },
  args: {
    num: "// 01",
    title: "Trending now · top 7 by category",
    as: "h2",
  },
};

export default meta;
type Story = StoryObj<typeof SectionHead>;

export const Basic: Story = {
  args: { num: "// 01", title: "Trending now · top 7 by category" },
};

export const WithMeta: Story = {
  render: () => (
    <SectionHead
      num="// 04"
      title="Featured · curated this week"
      meta={
        <>
          editor · <b>3</b> picks
        </>
      }
    />
  ),
};

export const SubSection: Story = {
  args: {
    num: "// 02.1",
    title: "Breakouts in the last 24h",
    as: "h3",
  },
};

export const LongTitle: Story = {
  render: () => (
    <SectionHead
      num="// 07"
      title="Cross-source agreement · the editorial-grade signal panel"
      meta={<>14 sources · live</>}
    />
  ),
};

export const Stacked: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <SectionHead num="// 01" title="Trending now" />
      <SectionHead num="// 02" title="Breakouts" meta={<>last 24h</>} />
      <SectionHead num="// 03" title="Funding" meta={<><b>$2.1B</b> · 14d</>} />
      <SectionHead num="// 04" title="Featured" />
    </div>
  ),
};
