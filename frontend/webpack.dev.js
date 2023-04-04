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
      watchFiles: ["src/*.js"],
      open: true,
      compress: true,
      hot: true,
      static: [
        {
          directory: shoelaceAssetsSrcPath,
          publicPath: "/" + shoelaceAssetsPublicPath,
        },
        {
          directory: path.join(__dirname),
          //publicPath: "/",
          watch: true,
        },
      ],
      historyApiFallback: true,
      proxy: devServerConfig.proxy,
      onBeforeSetupMiddleware: devServerConfig.onBeforeSetupMiddleware,
      port: 9870,
    },
  }),
  {
    ...vnc,
    mode: "production",
  },
];
