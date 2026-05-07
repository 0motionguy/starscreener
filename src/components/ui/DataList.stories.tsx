import type { Meta, StoryObj } from "@storybook/react";

import { DataList, DataRow } from "./DataList";

const meta: Meta<typeof DataList> = {
  title: "UI/DataList",
  component: DataList,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DataList>;

export const Basic: Story = {
  render: () => (
    <DataList>
      <DataRow first>
        <span>vercel/next.js</span>
        <span>128.4k ★</span>
      </DataRow>
      <DataRow>
        <span>facebook/react</span>
        <span>225.1k ★</span>
      </DataRow>
      <DataRow>
        <span>microsoft/typescript</span>
        <span>99.7k ★</span>
      </DataRow>
    </DataList>
  ),
};

export const WithHeader: Story = {
  render: () => (
    <DataList
      header={
        <>
          <span>repo</span>
          <span>stars</span>
        </>
      }
    >
      <DataRow first>
        <span>shadcn-ui/ui</span>
        <span>72.3k</span>
      </DataRow>
      <DataRow>
        <span>tailwindlabs/tailwindcss</span>
        <span>82.0k</span>
      </DataRow>
      <DataRow>
        <span>vitejs/vite</span>
        <span>67.8k</span>
      </DataRow>
    </DataList>
  ),
};

export const SingleRow: Story = {
  render: () => (
    <DataList>
      <DataRow first>
        <span>only one row</span>
        <span>—</span>
      </DataRow>
    </DataList>
  ),
};

export const Empty: Story = {
  render: () => (
    <DataList header={<span>no data</span>}>
      <DataRow first>
        <span style={{ opacity: 0.5 }}>// nothing to show</span>
      </DataRow>
    </DataList>
  ),
};
