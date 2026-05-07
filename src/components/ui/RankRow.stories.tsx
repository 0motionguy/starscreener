import type { Meta, StoryObj } from "@storybook/react";

import { RankRow } from "./RankRow";

const meta: Meta<typeof RankRow> = {
  title: "UI/RankRow",
  component: RankRow,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RankRow>;

const Avatar = ({ ch }: { ch: string }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 24,
      height: 24,
      borderRadius: 2,
      background: "var(--v4-bg-100, #1a1a1a)",
      border: "1px solid var(--v4-line-200, #2a2a2a)",
      fontFamily: "ui-monospace",
      fontSize: 11,
      color: "var(--v4-ink-200, #c0c0c0)",
    }}
    aria-hidden
  >
    {ch}
  </span>
);

export const First: Story = {
  render: () => (
    <RankRow
      rank={1}
      avatar={<Avatar ch="A" />}
      title={
        <>
          anthropic <span style={{ opacity: 0.5 }}>/</span> claude-code
        </>
      }
      desc="Agentic coding tool that lives in your terminal"
      metric={{ label: "/ 5.0", value: "4.81" }}
      delta={{ value: "+18%", direction: "up" }}
      first
    />
  ),
};

export const Standard: Story = {
  render: () => (
    <RankRow
      rank={4}
      avatar={<Avatar ch="V" />}
      title={
        <>
          vercel <span style={{ opacity: 0.5 }}>/</span> next.js
        </>
      }
      desc="The React framework for the web"
      metric={{ label: "stars", value: "128.4k" }}
      delta={{ value: "+842", direction: "up" }}
    />
  ),
};

export const Down: Story = {
  render: () => (
    <RankRow
      rank={12}
      avatar={<Avatar ch="F" />}
      title="facebook/react"
      metric={{ value: "225k" }}
      delta={{ value: "-1.2%", direction: "down" }}
    />
  ),
};

export const Flat: Story = {
  render: () => (
    <RankRow
      rank={28}
      avatar={<Avatar ch="M" />}
      title="microsoft/typescript"
      metric={{ value: "99.7k" }}
      delta={{ value: "0.0%", direction: "flat" }}
    />
  ),
};

export const NoAvatar: Story = {
  render: () => (
    <RankRow
      rank={7}
      title="generic/repo"
      desc="Lightweight rank row without avatar"
      metric={{ value: "12k" }}
      delta={{ value: "+6.8%", direction: "up" }}
    />
  ),
};

export const Linked: Story = {
  render: () => (
    <RankRow
      rank={1}
      avatar={<Avatar ch="A" />}
      title="anthropic/claude-code"
      desc="Click anywhere on the row → navigates"
      metric={{ value: "4.81", label: "/ 5.0" }}
      delta={{ value: "+18%", direction: "up" }}
      href="#"
      first
    />
  ),
};

export const Stack: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <RankRow rank={1} avatar={<Avatar ch="A" />} title="anthropic/claude-code" metric={{ value: "4.81" }} delta={{ value: "+18%", direction: "up" }} first />
      <RankRow rank={2} avatar={<Avatar ch="V" />} title="vercel/ai" metric={{ value: "4.74" }} delta={{ value: "+14%", direction: "up" }} />
      <RankRow rank={3} avatar={<Avatar ch="L" />} title="langchain-ai/langgraph" metric={{ value: "4.62" }} delta={{ value: "+9%", direction: "up" }} />
      <RankRow rank={4} avatar={<Avatar ch="O" />} title="openai/swarm" metric={{ value: "4.58" }} delta={{ value: "-2%", direction: "down" }} />
      <RankRow rank={5} avatar={<Avatar ch="C" />} title="continuedev/continue" metric={{ value: "4.51" }} delta={{ value: "0.0%", direction: "flat" }} />
    </div>
  ),
};
