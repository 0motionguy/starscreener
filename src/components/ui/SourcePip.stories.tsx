import type { Meta, StoryObj } from "@storybook/react";

import { SourcePip } from "./SourcePip";

const SOURCES = ["hn", "gh", "x", "reddit", "bsky", "dev", "claude", "openai"] as const;

const meta: Meta<typeof SourcePip> = {
  title: "UI/SourcePip",
  component: SourcePip,
  tags: ["autodocs"],
  argTypes: {
    src: { control: { type: "select" }, options: SOURCES },
    size: { control: { type: "select" }, options: ["sm", "md", "lg"] },
  },
  args: { src: "hn", size: "md" },
};

export default meta;
type Story = StoryObj<typeof SourcePip>;

export const HN: Story = { args: { src: "hn" } };
export const GH: Story = { args: { src: "gh" } };
export const X: Story = { args: { src: "x" } };
export const Reddit: Story = { args: { src: "reddit" } };
export const Bsky: Story = { args: { src: "bsky" } };
export const Dev: Story = { args: { src: "dev" } };
export const Claude: Story = { args: { src: "claude" } };
export const OpenAI: Story = { args: { src: "openai" } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <SourcePip src="hn" size="sm" />
      <SourcePip src="hn" size="md" />
      <SourcePip src="hn" size="lg" />
    </div>
  ),
};

export const AllSources: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {SOURCES.map((src) => (
        <SourcePip key={src} src={src} title={src} />
      ))}
    </div>
  ),
};

export const CustomCode: Story = {
  args: { src: "gh", code: "AGN", title: "agent-flow" },
};
