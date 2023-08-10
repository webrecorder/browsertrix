const path = require("path");
const { merge } = require("webpack-merge");

const [main, vnc] = require("./webpack.config.js");
const devServerConfig = require("./config/dev-server.js");

const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets"
);
const shoelaceAssetsPublicPath = "shoelace/assets";

module.exports = [
  merge(main, {
    devServer: {
      watchFiles: ["src/**/*", __filename],
      open: true,
      compress: true,
      static: [
        {
          directory: shoelaceAssetsSrcPath,
          publicPath: "/" + shoelaceAssetsPublicPath,
        },
      ],
      historyApiFallback: true,
      proxy: devServerConfig.proxy,
      setupMiddlewares: devServerConfig.setupMiddlewares,
      port: 9870,
    },
    cache: {
      type: "filesystem",
      buildDependencies: {
        config: [__filename],
      },
    },
  }),
  {
    ...vnc,
    mode: "production",
  },
];
