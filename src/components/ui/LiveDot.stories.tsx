import type { Meta, StoryObj } from "@storybook/react";

import { LiveDot } from "./LiveDot";

const meta: Meta<typeof LiveDot> = {
  title: "UI/LiveDot",
  component: LiveDot,
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: { type: "select" },
      options: ["money", "amber", "red", "none"],
    },
  },
  args: {
    tone: "money",
    label: "LIVE",
  },
};

export default meta;
type Story = StoryObj<typeof LiveDot>;

export const Live: Story = {
  args: { tone: "money", label: "LIVE" },
};

export const Stale: Story = {
  args: { tone: "amber", label: "STALE" },
};

export const Down: Story = {
  args: { tone: "red", label: "DOWN" },
};

export const NoLabel: Story = {
  args: { tone: "money", label: undefined },
};
