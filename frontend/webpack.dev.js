// @ts-check

const path = require("path");

const ESLintPlugin = require("eslint-webpack-plugin");
const { merge } = require("webpack-merge");

const devServerConfig = require("./config/dev-server.js");
const baseConfigs = require("./webpack.config.js");
const [main, vnc] = baseConfigs;

const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets",
);
const shoelaceAssetsPublicPath = "shoelace/assets";

module.exports = [
  merge(main, {
    devtool: "eval-cheap-source-map",
    /** @type {import('webpack-dev-server').Configuration} */
    devServer: {
      watchFiles: ["src/**/*", __filename],
      open: true,
      compress: false,
      hot: false,
      static: [
        {
          directory: shoelaceAssetsSrcPath,
          publicPath: "/" + shoelaceAssetsPublicPath,
        },
      ],
      historyApiFallback: true,
      proxy: devServerConfig.proxy,
      onBeforeSetupMiddleware: devServerConfig.onBeforeSetupMiddleware,
      port: 9870,
    },
    cache: {
      type: "filesystem",
      hashAlgorithm: "xxhash64",
      buildDependencies: {
        config: [__filename],
      },
    },
    plugins: [
      new ESLintPlugin({
        extensions: ["ts", "js"],
      }),
    ],
  }),
  {
    ...vnc,
    mode: "production",
  },
];
