const path = require("path");
const { merge } = require("webpack-merge");

const common = require("./webpack.config.js");

// for testing: for prod, the Dockerfile should have the official prod version used
const RWP_BASE_URL = process.env.RWP_BASE_URL || "https://replayweb.page/";

if (!process.env.API_BASE_URL) {
  throw new Error(
    "To run a dev frontend server, please set the API_BASE_URL pointing to your backend api server in '.env.local'"
  );
}

const devBackendUrl = new URL(process.env.API_BASE_URL);
const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets"
);
const shoelaceAssetsPublicPath = "shoelace/assets";

module.exports = merge(common, {
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
    proxy: {
      "/api": {
        target: devBackendUrl.href,
        headers: {
          Host: devBackendUrl.host,
        },
        ws: true,
      },

      "/data": {
        target: devBackendUrl.href,
        headers: {
          Host: devBackendUrl.host,
        },
      },
    },
    // Serve replay service worker file
    onBeforeSetupMiddleware: (server) => {
      server.app.get("/replay/sw.js", (req, res) => {
        res.set("Content-Type", "application/javascript");
        res.send(`importScripts("${RWP_BASE_URL}sw.js")`);
      });
    },
    port: 9870,
  },
});
