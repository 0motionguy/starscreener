import type { Meta, StoryObj } from "@storybook/react";

import { Chip } from "./Chip";

const meta: Meta<typeof Chip> = {
  title: "UI/Chip",
  component: Chip,
  tags: ["autodocs"],
  argTypes: {
    on: { control: "boolean" },
    tone: {
      control: { type: "select" },
      options: ["default", "acc"],
    },
    as: {
      control: { type: "select" },
      options: ["button", "span"],
    },
    disabled: { control: "boolean" },
    swatch: { control: "text" },
    count: { control: "text" },
  },
  args: {
    children: "ALL",
    on: false,
    tone: "default",
    as: "button",
  },
};

export default meta;
type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  args: { children: "ALL" },
};

export const On: Story = {
  args: { children: "REPOS", on: true },
};

export const WithSwatch: Story = {
  args: { children: "HN", swatch: "var(--v4-src-hn, #ff6600)" },
};

export const WithCount: Story = {
  args: { children: "REPOS", on: true, count: 42 },
};

export const Accent: Story = {
  args: { children: "24H", tone: "acc", on: true },
};
