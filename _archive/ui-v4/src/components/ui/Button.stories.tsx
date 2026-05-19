import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["neutral", "primary", "ghost", "chip", "segment", "dashed"],
    },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg", "xl", "format"],
    },
    active: { control: "boolean" },
    statusDot: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Button",
    variant: "neutral",
    size: "md",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Neutral: Story = {
  args: { variant: "neutral", children: "Neutral" },
};

export const Primary: Story = {
  args: { variant: "primary", children: "Primary action" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Ghost" },
};

export const WithStatusDot: Story = {
  args: {
    variant: "neutral",
    statusDot: true,
    children: "Live",
  },
};

export const ActiveSegment: Story = {
  args: {
    variant: "segment",
    active: true,
    children: "Selected",
  },
};
