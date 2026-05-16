import type { Meta, StoryObj } from "@storybook/react";

import { PageHead } from "./PageHead";

const meta: Meta<typeof PageHead> = {
  title: "UI/PageHead",
  component: PageHead,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    noBorder: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof PageHead>;

export const Default: Story = {
  args: {
    crumb: (
      <>
        <b>SIGNAL</b> · TERMINAL · /SIGNALS
      </>
    ),
    h1: "The newsroom for AI & dev tooling.",
    lede: "Eight sources, one editorial layer — signal volume scored across every channel that matters.",
    clock: <span style={{ fontFamily: "monospace" }}>06:29:14 UTC</span>,
  },
};

export const WithLogo: Story = {
  args: {
    crumb: (
      <>
        <b>SOURCE</b> · LOBSTERS
      </>
    ),
    h1: "Lobsters · trending today",
    logo: (
      <span
        style={{
          display: "inline-block",
          width: 32,
          height: 32,
          background: "var(--v4-src-lobsters, #ac130d)",
          borderRadius: 4,
        }}
      />
    ),
    lede: "Top stories from the Lobsters community across the last 24 hours.",
  },
};

export const NoBorder: Story = {
  args: {
    crumb: "// TERMINAL",
    h1: "Compact header",
    noBorder: true,
  },
};
