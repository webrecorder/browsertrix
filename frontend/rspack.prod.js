// @ts-check

const rspack = require("@rspack/core");
const ESLintPlugin = require("eslint-rspack-plugin");
const { merge } = require("webpack-merge");

const baseConfigs = require("./rspack.config.js");
const [main, vnc] = baseConfigs;

module.exports = [
  merge(
    main,
    /** @type {import('@rspack/core').Configuration} */
    {
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
          new rspack.SwcJsMinimizerRspackPlugin({
            minimizerOptions: {
              compress: {
                drop_console: true,
              },
            },
          }),
          new rspack.LightningCssMinimizerRspackPlugin(),
        ],
      },
      plugins: [
        new ESLintPlugin({
          failOnWarning: true,
          extensions: ["ts", "js"],
        }),
      ],
    },
  ),
  {
    ...vnc,
    mode: "production",
  },
];
