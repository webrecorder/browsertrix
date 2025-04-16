import type { StorybookConfig } from "@storybook/web-components-webpack5";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-webpack5-compiler-swc",
    "@storybook/addon-essentials",
  ],
  framework: {
    name: "@storybook/web-components-webpack5",
    options: {},
  },
};
export default config;
