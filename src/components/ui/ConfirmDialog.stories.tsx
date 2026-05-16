import type { Meta, StoryObj } from "@storybook/react";

import { ConfirmDialog } from "./ConfirmDialog";

const meta: Meta<typeof ConfirmDialog> = {
  title: "UI/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    open: { control: "boolean" },
    tone: {
      control: { type: "select" },
      options: ["danger", "warning", "neutral"],
    },
    busy: { control: "boolean" },
  },
  args: {
    open: true,
    title: "Delete this item?",
    description: "This action cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    tone: "danger",
    busy: false,
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Danger: Story = {
  args: {
    title: "Delete this repository?",
    description: "Removing this from the tracker is permanent.",
    confirmLabel: "Delete",
    tone: "danger",
  },
};

export const Warning: Story = {
  args: {
    title: "Mark as stale?",
    description: "The repo will drop out of the live feed.",
    confirmLabel: "Mark stale",
    tone: "warning",
  },
};

export const Neutral: Story = {
  args: {
    title: "Continue?",
    description: undefined,
    confirmLabel: "Continue",
    tone: "neutral",
  },
};

export const Busy: Story = {
  args: {
    busy: true,
    confirmLabel: "Deleting…",
  },
};
