import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  stories: ["../src/components/ui/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  webpackFinal: async (baseConfig) => {
    return {
      ...baseConfig,
      cache: false,
    };
  },
};

export default config;
