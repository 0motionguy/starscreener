import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { TabBar } from "./TabBar";
import { SourcePip } from "./SourcePip";
import { LiveDot } from "./LiveDot";

const meta: Meta<typeof TabBar> = {
  title: "UI/TabBar",
  component: TabBar,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TabBar>;

export const Basic: Story = {
  render: () => {
    const [active, setActive] = useState("all");
    return (
      <TabBar
        items={[
          { id: "all", label: "ALL", count: 14 },
          { id: "repos", label: "REPOS", count: 8 },
          { id: "skills", label: "SKILLS", count: 4 },
          { id: "mcp", label: "MCP", count: 2 },
        ]}
        active={active}
        onChange={setActive}
      />
    );
  },
};

export const WithIcons: Story = {
  render: () => {
    const [active, setActive] = useState("hn");
    return (
      <TabBar
        items={[
          { id: "all", label: "ALL", count: 14 },
          { id: "hn", label: "HN", count: 3, icon: <SourcePip src="hn" size="sm" /> },
          { id: "x", label: "X", count: 5, icon: <SourcePip src="x" size="sm" /> },
          { id: "r", label: "REDDIT", count: 6, icon: <SourcePip src="reddit" size="sm" /> },
        ]}
        active={active}
        onChange={setActive}
      />
    );
  },
};

export const WithRightSlot: Story = {
  render: () => {
    const [active, setActive] = useState("repos");
    return (
      <TabBar
        items={[
          { id: "repos", label: "REPOS", count: 248 },
          { id: "breakouts", label: "BREAKOUTS", count: 14 },
          { id: "featured", label: "FEATURED", count: 3 },
        ]}
        active={active}
        onChange={setActive}
        rightSlot={<LiveDot label="LIVE · sort: momentum" />}
      />
    );
  },
};

export const WithDisabled: Story = {
  render: () => {
    const [active, setActive] = useState("repos");
    return (
      <TabBar
        items={[
          { id: "repos", label: "REPOS", count: 248 },
          { id: "skills", label: "SKILLS", count: 142 },
          { id: "mcp", label: "MCP", count: 48 },
          { id: "soon", label: "AGENTS", disabled: true },
        ]}
        active={active}
        onChange={setActive}
      />
    );
  },
};

export const LinkMode: Story = {
  render: () => (
    <TabBar
      items={[
        { id: "/", label: "TREND" },
        { id: "/signals", label: "SIGNAL" },
        { id: "/funding", label: "FUNDING" },
        { id: "/consensus", label: "CONSENSUS" },
      ]}
      active="/signals"
      hrefFor={(id) => id}
    />
  ),
};
