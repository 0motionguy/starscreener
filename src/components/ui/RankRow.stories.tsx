import type { Meta, StoryObj } from "@storybook/react";

import { RankRow } from "./RankRow";

const meta: Meta<typeof RankRow> = {
  title: "UI/RankRow",
  component: RankRow,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    first: { control: "boolean" },
    rank: { control: "text" },
  },
  args: {
    rank: 1,
    title: (
      <>
        anthropic <span className="o">/</span> claude-code
      </>
    ),
    desc: "Agentic coding tool that lives in your terminal",
    arrow: "›",
  },
};

export default meta;
type Story = StoryObj<typeof RankRow>;

export const FirstRow: Story = {
  args: {
    first: true,
    metric: { value: "4.81", label: "/ 5.0" },
    delta: { value: "+18%", direction: "up" },
  },
};

export const Standard: Story = {
  args: {
    rank: 2,
    title: (
      <>
        openai <span className="o">/</span> openai-python
      </>
    ),
    desc: "Official Python client for the OpenAI API",
    metric: { value: "4.62", label: "/ 5.0" },
    delta: { value: "+9%", direction: "up" },
  },
};

export const Downward: Story = {
  args: {
    rank: 7,
    title: "vercel / next.js",
    metric: { value: "4.10", label: "/ 5.0" },
    delta: { value: "-3%", direction: "down" },
  },
};

export const AsLink: Story = {
  args: {
    rank: 3,
    title: "huggingface / transformers",
    href: "#",
    metric: { value: "4.48" },
  },
};
