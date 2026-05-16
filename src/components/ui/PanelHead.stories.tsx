import type { Meta, StoryObj } from "@storybook/react";

import { PanelHead } from "./PanelHead";

const meta: Meta<typeof PanelHead> = {
  title: "UI/PanelHead",
  component: PanelHead,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
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

export const Default: Story = {};

export const WithSubtitle: Story = {
  args: {
    k: "// 01 SIGNAL VOLUME",
    sub: "STACKED · 24H · BY SOURCE",
  },
};

export const WithRight: Story = {
  args: {
    k: "REPOS · TOP GAINERS",
    right: <span>7 / 1,247</span>,
  },
};

export const NoCorner: Story = {
  args: {
    k: "// SUB-HEAD",
    sub: "QUIETER FRAME",
    corner: false,
  },
};
