import type { Meta, StoryObj } from "@storybook/react";

import { DataList, DataRow } from "./DataList";

const meta: Meta<typeof DataList> = {
  title: "UI/DataList",
  component: DataList,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DataList>;

export const Default: Story = {
  args: {
    children: (
      <>
        <DataRow first>
          <span>anthropic/claude-code</span>
        </DataRow>
        <DataRow>
          <span>openai/openai-python</span>
        </DataRow>
        <DataRow>
          <span>vercel/next.js</span>
        </DataRow>
      </>
    ),
  },
};

export const WithHeader: Story = {
  args: {
    header: <span>REPOS · TOP 3</span>,
    children: (
      <>
        <DataRow first>
          <span>anthropic/claude-code · 4.81</span>
        </DataRow>
        <DataRow>
          <span>openai/openai-python · 4.62</span>
        </DataRow>
        <DataRow>
          <span>vercel/next.js · 4.48</span>
        </DataRow>
      </>
    ),
  },
};
