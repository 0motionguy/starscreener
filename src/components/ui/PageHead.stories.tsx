import type { Meta, StoryObj } from "@storybook/react";

import { PageHead } from "./PageHead";

const meta: Meta<typeof PageHead> = {
  title: "UI/PageHead",
  component: PageHead,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PageHead>;

export const Signals: Story = {
  render: () => (
    <PageHead
      crumb={
        <>
          <b>SIGNAL</b> · TERMINAL · /SIGNALS
        </>
      }
      h1="The newsroom for AI & dev tooling."
      lede="Eight sources, one editorial layer. Every breakout repo, ranked, sourced, and timestamped."
      clock={
        <span style={{ fontFamily: "ui-monospace", fontSize: 12 }}>
          14:22:08 UTC · LIVE
        </span>
      }
    />
  ),
};

export const NoLede: Story = {
  render: () => (
    <PageHead
      crumb={
        <>
          <b>FUNDING</b> · TERMINAL · /FUNDING
        </>
      }
      h1="Capital flow into open source"
    />
  ),
};

export const NoClock: Story = {
  render: () => (
    <PageHead
      crumb={
        <>
          <b>METHOD</b> · TERMINAL · /METHODOLOGY
        </>
      }
      h1="How we score, classify, and rank"
      lede="Every signal has a cost; every score has a receipt. Read the full pipeline."
    />
  ),
};

export const NoBorder: Story = {
  render: () => (
    <PageHead
      crumb={
        <>
          <b>HOME</b> · TERMINAL
        </>
      }
      h1="Trending repos, scored in real time"
      lede="The first 1,000 stars, the first hour, the first signal — caught before everyone else."
      clock={
        <span style={{ fontFamily: "ui-monospace", fontSize: 12 }}>
          14:22:08 UTC
        </span>
      }
      noBorder
    />
  ),
};
