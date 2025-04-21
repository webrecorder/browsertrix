import path from "path";

import type { StorybookConfig } from "@storybook/web-components-webpack5";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-webpack5-compiler-swc",
    "@storybook/addon-essentials",
    {
      name: "@storybook/addon-styling-webpack",
      options: {
        // TODO Consolidate with webpack.config.js
        rules: [
          {
            // Global styles and assets, like fonts and Shoelace,
            // that get added to document styles
            test: /\.css$/,
            sideEffects: true,
            include: [
              path.resolve(__dirname, "../src"),
              path.resolve(
                __dirname,
                "../node_modules/@shoelace-style/shoelace",
              ),
            ],
            exclude: /\.stylesheet\.css$/,
            use: [
              require.resolve("style-loader"),
              {
                loader: require.resolve("css-loader"),
                options: {
                  importLoaders: 1,
                },
              },
              {
                loader: require.resolve("postcss-loader"),
                options: {
                  implementation: require.resolve("postcss"),
                },
              },
            ],
          },
          {
            // CSS loaded as raw string and used as a CSSStyleSheet
            test: /\.stylesheet\.css$/,
            sideEffects: true,
            type: "asset/source",
            use: [
              {
                loader: require.resolve("postcss-loader"),
                options: {
                  implementation: require.resolve("postcss"),
                },
              },
            ],
          },
        ],
      },
    },
  ],
  framework: {
    name: "@storybook/web-components-webpack5",
    options: {},
  },
  webpackFinal: async (config) => {
    // Show eslint errors from Storybook files in Webpack overlay
    const ESLintPlugin = require("eslint-webpack-plugin");

    config.plugins?.push(
      new ESLintPlugin({
        files: ["**/stories/*.ts", "**/.storybook/*.ts"],
      }),
    );

    return config;
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
  core: {
    disableTelemetry: true,
  },
};
export default config;
