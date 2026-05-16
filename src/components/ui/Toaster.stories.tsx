import type { Meta, StoryObj } from "@storybook/react";

import { Toaster } from "./Toaster";

// The Toaster is a portal-based provider re-exported from
// components/feedback/ToasterLazy. The Default story renders the surface
// mounted; firing toasts is exercised in the parent app, not in Storybook.

const meta: Meta<typeof Toaster> = {
  title: "UI/Toaster",
  component: Toaster,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  render: () => (
    <div style={{ minHeight: 240, padding: 24, color: "var(--v4-ink-300, #8a8a8a)" }}>
      Toaster mounted. Toasts appear via the sonner provider; this story
      proves the surface renders without crashing.
      <Toaster />
    </div>
  ),
};
