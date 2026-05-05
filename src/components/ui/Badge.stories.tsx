import type { Meta, StoryObj } from "@storybook/react";

import { Badge, Chip } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    tone: {
      control: { type: "select" },
      options: [
        "neutral",
        "accent",
        "positive",
        "warning",
        "danger",
        "consensus",
        "early",
        "divergence",
        "external",
        "single",
        "hot",
        "new",
        "firing",
      ],
    },
    size: {
      control: { type: "select" },
      options: ["xs", "sm", "md"],
    },
    dot: { control: "boolean" },
    active: { control: "boolean" },
  },
  args: {
    children: "Badge",
    tone: "neutral",
    size: "sm",
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Neutral: Story = {
  args: { tone: "neutral", children: "neutral" },
};

export const Accent: Story = {
  args: { tone: "accent", children: "accent" },
};

export const Hot: Story = {
  args: { tone: "hot", dot: true, children: "hot" },
};

export const WithCount: Story = {
  args: { tone: "positive", children: "wins", count: 12 },
};

export const ChipPressed: Story = {
  render: () => (
    <Chip tone="accent" active dot>
      filter: trending
    </Chip>
  ),
};
