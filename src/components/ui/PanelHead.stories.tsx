import type { Meta, StoryObj } from "@storybook/react";

import { PanelHead } from "./PanelHead";
import { LiveDot } from "./LiveDot";

const meta: Meta<typeof PanelHead> = {
  title: "UI/PanelHead",
  component: PanelHead,
  tags: ["autodocs"],
  argTypes: {
    corner: { control: "boolean" },
  },
  args: {
    k: "// 01 SIGNAL VOLUME",
    corner: true,
  },
};

export default meta;
type Story = StoryObj<typeof PanelHead>;

export const KeyOnly: Story = {
  args: { k: "// 01 SIGNAL VOLUME" },
};

export const KeyAndSub: Story = {
  args: {
    k: "// 01 SIGNAL VOLUME",
    sub: "STACKED · 24H · BY SOURCE",
  },
};

export const WithLive: Story = {
  render: () => (
    <PanelHead
      k="// 01 SIGNAL VOLUME"
      sub="STACKED · 24H · BY SOURCE"
      right={<LiveDot label="LIVE" />}
    />
  ),
};

export const WithCount: Story = {
  args: {
    k: "REPOS · TOP GAINERS",
    right: "7 / 1,247",
  },
};

export const NoCorner: Story = {
  args: {
    k: "// CONSENSUS BAND",
    sub: "AGREE · DIVERGE · OUTLIER",
    corner: false,
  },
};
