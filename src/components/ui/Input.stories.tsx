import type { Meta, StoryObj } from "@storybook/react";

import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "Search repos…",
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithLeftIcon: Story = {
  args: {
    leftIcon: <span aria-hidden>{"\u{1F50D}"}</span>,
    placeholder: "Search…",
  },
};

export const WithRightSlot: Story = {
  args: {
    rightSlot: <kbd>/</kbd>,
    placeholder: "Press / to focus",
  },
};

export const Disabled: Story = {
  args: { disabled: true, value: "read-only", readOnly: true },
};
