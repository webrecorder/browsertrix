// @ts-check
const path = require("path");

const ESLintPlugin = require("eslint-webpack-plugin");
const webpack = require("webpack");
const { merge } = require("webpack-merge");

const {
  shoelaceAssetsSrcPath,
  shoelaceAssetsPublicPath,
} = require("./config/webpack/shoelace.js");
const baseConfigs = require("./webpack.config.js");
const [main, vnc] = baseConfigs;

if (!process.env.API_BASE_URL) {
  throw new Error(
    "To run a dev frontend server, please set the API_BASE_URL pointing to your backend api server in '.env.local'",
  );
}

// for testing: for prod, using the version specified in Helm values.yaml
const RWP_BASE_URL =
  process.env.RWP_BASE_URL || "https://cdn.jsdelivr.net/npm/replaywebpage/";

const devBackendUrl = new URL(process.env.API_BASE_URL);

/** @type {import('webpack').Configuration['plugins']} */
const plugins = [
  new ESLintPlugin({
    extensions: ["ts", "js"],
  }),
];

// Dev config may be used in Playwright E2E CI tests
if (process.env.WEBPACK_SERVE === "true") {
  let litManifest;

  try {
    litManifest = require.resolve(
      path.join(__dirname, "dist/vendor/lit-manifest.json"),
    );
  } catch {
    console.warn(
      "`lit-manifest.json` not found. If you're seeing this with `yarn start`, ensure the file exists. You can ignore this message otherwise.",
    );
  }

  if (litManifest) {
    plugins.unshift(
      // Speed up rebuilds by excluding vendor modules
      new webpack.DllReferencePlugin({
        manifest: require.resolve(
          path.join(__dirname, "dist/vendor/lit-manifest.json"),
        ),
      }),
    );
  }
}

module.exports = [
  merge(main, {
    devtool: "eval",
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
        {
          directory: path.join(__dirname, "dist/vendor"),
          publicPath: "/vendor",
        },
      ],
      historyApiFallback: true,
      proxy: [
        {
          context: "/api",

          target: devBackendUrl.href,
          headers: {
            Host: devBackendUrl.host,
          },
          ws: true,
        },
        {
          context: "/data",
          target: devBackendUrl.href,
          headers: {
            Host: devBackendUrl.host,
          },
        },
      ],
      setupMiddlewares: (middlewares, server) => {
        // Serve replay service worker file
        server.app?.get("/replay/sw.js", (req, res) => {
          res.set("Content-Type", "application/javascript");
          res.send(`importScripts("${RWP_BASE_URL}sw.js")`);
        });

        server.app?.get("/replay/ui.js", (req, res) => {
          res.set("Content-Type", "application/javascript");
          res.redirect(307, RWP_BASE_URL + "ui.js");
        });

        // serve a 404 page for /replay/ path, as that should be taken over by RWP
        server.app?.get("/replay/*", (req, res) => {
          res.set("Content-Type", "application/javascript");
          res.status(404).send(`{"error": "placeholder_for_replay"}`);
        });

        // Serve analytics script, which is set in prod as an env variable by the Helm chart
        server.app?.get("/extra.js", (req, res) => {
          res.set("Content-Type", "application/javascript");
          res.status(200).send(process.env.INJECT_EXTRA || "");
        });

        return middlewares;
      },
      port: 9870,
    },
    cache: {
      type: "filesystem",
      hashAlgorithm: "xxhash64",
      buildDependencies: {
        config: [__filename],
      },
    },
    plugins,
  }),
  {
    ...vnc,
    mode: "production",
  },
];
