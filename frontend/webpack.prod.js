// @ts-check

const ESLintPlugin = require("eslint-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { merge } = require("webpack-merge");

const baseConfigs = require("./webpack.config.js");
const [main, vnc] = baseConfigs;

module.exports = [
  merge(main, {
    mode: "production",
    devtool: "source-map",

    // TODO figure out minifying lit templates
    optimization: {
      runtimeChunk: "single",
      splitChunks: {
        // Split both async and non-async chunks (only async by default)
        chunks: "all",
      },
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: ["log", "debug"],
            },
          },
        }),
      ],
    },
    plugins: [
      new ESLintPlugin({
        failOnWarning: true,
        extensions: ["ts", "js"],
      }),
    ],
  }),
  {
    ...vnc,
    mode: "production",
  },
];
