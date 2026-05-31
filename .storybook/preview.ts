import type { Preview } from "@storybook/react";

import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "trendingrepo",
      values: [
        { name: "trendingrepo", value: "#0b0d10" },
        { name: "light", value: "#ffffff" },
      ],
    },
    layout: "centered",
  },
};

export default preview;
