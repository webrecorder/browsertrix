import path from "path";

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
  swc: {
    jsc: {
      parser: {
        syntax: "typescript",
        decorators: true,
      },
      // TODO Consolidate with tsconfig.json
      transform: {
        useDefineForClassFields: false,
      },
      baseUrl: path.resolve(__dirname, ".."),
      // TODO Consolidate with tsconfig.json
      paths: {
        "@/*": ["./src/*"],
        "~assets/*": ["./assets/src/*"],
      },
    },
  },
};
export default config;
