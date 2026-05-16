import type { Meta, StoryObj } from "@storybook/react";

import { FooterBar, FooterLink } from "./FooterBar";

const meta: Meta<typeof FooterBar> = {
  title: "UI/FooterBar",
  component: FooterBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    as: {
      control: { type: "select" },
      options: ["footer", "div"],
    },
  },
  args: {
    as: "footer",
  },
};

export default meta;
type Story = StoryObj<typeof FooterBar>;

export const Default: Story = {
  args: {
    meta: <span>// FOOTER · TRENDINGREPO · 2026</span>,
  },
};

export const WithActions: Story = {
  args: {
    meta: <span>// FOOTER · 30 sources · last sync 1m ago</span>,
    actions: (
      <>
        <FooterLink href="/about">About</FooterLink>
        <FooterLink href="https://github.com" external>
          GitHub
        </FooterLink>
      </>
    ),
  },
};
