import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { TabBar, type TabItem } from "./TabBar";

const meta: Meta<typeof TabBar> = {
  title: "UI/TabBar",
  component: TabBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof TabBar>;

const items: TabItem[] = [
  { id: "all", label: "ALL", count: 14 },
  { id: "repos", label: "REPOS", count: 7 },
  { id: "skills", label: "SKILLS", count: 3 },
  { id: "mcp", label: "MCP", count: 4 },
];

export const Default: Story = {
  render: () => {
    const Wrapper = () => {
      const [active, setActive] = useState("all");
      return <TabBar items={items} active={active} onChange={setActive} />;
    };
    return <Wrapper />;
  },
};

export const WithDisabled: Story = {
  render: () => {
    const Wrapper = () => {
      const [active, setActive] = useState("repos");
      const withDisabled: TabItem[] = items.map((item) =>
        item.id === "mcp" ? { ...item, disabled: true } : item,
      );
      return (
        <TabBar items={withDisabled} active={active} onChange={setActive} />
      );
    };
    return <Wrapper />;
  },
};

export const LinkMode: Story = {
  args: {
    items: [
      { id: "/", label: "TREND" },
      { id: "/signals", label: "SIGNAL" },
      { id: "/consensus", label: "CONSENSUS" },
    ],
    active: "/signals",
    hrefs: {
      "/": "/",
      "/signals": "/signals",
      "/consensus": "/consensus",
    },
  },
};

export const WithRightSlot: Story = {
  render: () => {
    const Wrapper = () => {
      const [active, setActive] = useState("all");
      return (
        <TabBar
          items={items}
          active={active}
          onChange={setActive}
          rightSlot={<span>Sort · momentum</span>}
        />
      );
    };
    return <Wrapper />;
  },
};
