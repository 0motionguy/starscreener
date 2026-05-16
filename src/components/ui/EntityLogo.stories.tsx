import type { Meta, StoryObj } from "@storybook/react";

import { EntityLogo } from "./EntityLogo";

const meta: Meta<typeof EntityLogo> = {
  title: "UI/EntityLogo",
  component: EntityLogo,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "select" },
      options: [16, 20, 24, 28, 32, 40, 48],
    },
    shape: {
      control: { type: "select" },
      options: ["square", "circle"],
    },
    src: { control: "text" },
    name: { control: "text" },
    alt: { control: "text" },
  },
  args: {
    name: "anthropic",
    size: 32,
    shape: "square",
  },
};

export default meta;
type Story = StoryObj<typeof EntityLogo>;

export const Monogram: Story = {
  args: { name: "anthropic" },
};

export const Circle: Story = {
  args: { name: "vercel", shape: "circle", size: 40 },
};

export const WithImageFallback: Story = {
  args: {
    name: "openai",
    src: "https://example.invalid/missing.png",
    size: 32,
  },
};

export const Small: Story = {
  args: { name: "hashicorp", size: 16 },
};
