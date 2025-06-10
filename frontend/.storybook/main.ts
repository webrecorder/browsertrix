import path from "path";

import type { StorybookConfig } from "@storybook/web-components-webpack5";
import EslintWebpackPlugin from "eslint-webpack-plugin";
import remarkGfm from "remark-gfm";
import type { WebpackConfiguration } from "webpack-dev-server";

import {
  shoelaceAssetsPublicPath,
  shoelaceAssetsSrcPath,
} from "../config/webpack/shoelace";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  staticDirs: [
    {
      from: shoelaceAssetsSrcPath,
      to: shoelaceAssetsPublicPath,
    },
    { from: "../src/assets/", to: "/assets" },
  ],
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
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
  ],
  framework: {
    name: "@storybook/web-components-webpack5",
    options: {},
  },
  webpackFinal: async (config) => {
    // Show eslint errors from Storybook files in Webpack overlay

    config.plugins?.push(
      // @ts-expect-error something to do with different symbols - not totally sure, but doesn't seem to be a problem
      new EslintWebpackPlugin({
        files: ["**/stories/**/*.ts", "**/.storybook/*.ts"],
      }),
    );

    // Watch for changes to custom-elements.json to re-render element
    // attributes whenever the custom elements manifest is generated
    (config as WebpackConfiguration).devServer = {
      watchFiles: ["**/custom-elements.json"],
    };

    return config;
  },
  swc: {
    jsc: {
      parser: {
        syntax: "typescript",
        decorators: true,
        jsx: true,
      },
      // TODO Consolidate with tsconfig.json
      transform: {
        useDefineForClassFields: false,
      },
      baseUrl: path.resolve(__dirname, ".."),
      // TODO Consolidate with tsconfig.json
      paths: {
        "@/*": ["./src/*"],
        "~assets/*": ["./src/assets/*"],
      },
    },
  },
  core: {
    disableTelemetry: true,
  },
};
export default config;
