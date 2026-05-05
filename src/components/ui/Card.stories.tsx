import type { Meta, StoryObj } from "@storybook/react";

import { Card, CardBody, CardHeader } from "./Card";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["panel", "feature", "mini", "tool"],
    },
    active: { control: "boolean" },
  },
  args: {
    variant: "panel",
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Panel: Story = {
  args: { variant: "panel" },
  render: (args) => (
    <Card {...args} style={{ minWidth: 320 }}>
      <CardHeader right={<span>right</span>}>HEADER</CardHeader>
      <CardBody>
        <p style={{ margin: 0 }}>
          Panel card body. Used for general dashboard surfaces.
        </p>
      </CardBody>
    </Card>
  ),
};

export const Feature: Story = {
  args: { variant: "feature" },
  render: (args) => (
    <Card {...args} style={{ minWidth: 320 }}>
      <CardHeader showCorner>FEATURE</CardHeader>
      <CardBody>Feature card with corner accent.</CardBody>
    </Card>
  ),
};

export const Mini: Story = {
  args: { variant: "mini" },
  render: (args) => (
    <Card {...args} style={{ minWidth: 240 }}>
      <CardBody>Mini card — compact surface.</CardBody>
    </Card>
  ),
};

export const Active: Story = {
  args: { variant: "panel", active: true },
  render: (args) => (
    <Card {...args} style={{ minWidth: 320 }}>
      <CardHeader>ACTIVE PANEL</CardHeader>
      <CardBody>This card has the is-active modifier applied.</CardBody>
    </Card>
  ),
};
