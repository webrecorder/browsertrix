// webpack.config.js
const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");
const childProcess = require("child_process");

const isDevServer = process.env.WEBPACK_SERVE;

// for testing: for prod, the Dockerfile should have the official prod version used
const RWP_BASE_URL = process.env.RWP_BASE_URL || "https://replayweb.page/";

const dotEnvPath = path.resolve(
  process.cwd(),
  `.env${isDevServer ? `.local` : ""}`
);
// Get git info to use as Glitchtip release version

const gitBranch = process.env.GIT_BRANCH_NAME || childProcess
  .execSync("git rev-parse --abbrev-ref HEAD")
  .toString()
  .trim();
const commitHash = process.env.GIT_COMMIT_HASH || childProcess
  .execSync("git rev-parse --short HEAD")
  .toString()
  .trim();

require("dotenv").config({
  path: dotEnvPath,
});

const backendUrl = new URL(
  process.env.API_BASE_URL || "https://btrix.webrecorder.net/"
);
const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets"
);
const shoelaceAssetsPublicPath = "shoelace/assets";

module.exports = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: `js/[name]${isDevServer ? "" : ".[contenthash]"}.js`,
    publicPath: "/",
  },

  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, "src"),
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          "style-loader",
          { loader: "css-loader", options: { importLoaders: 1 } },
          "postcss-loader",
        ],
      },
      {
        test: /\.html$/,
        loader: "html-loader",
      },
    ],
  },

  resolve: {
    extensions: [".ts", ".js"],
  },

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
        target: backendUrl.href,
        headers: {
          Host: backendUrl.host,
        },
        pathRewrite: { "^/api": "" },
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

  plugins: [
    new Dotenv({ path: dotEnvPath }),

    new HtmlWebpackPlugin({
      template: "src/index.ejs",
      templateParameters: {
        rwp_base_url: RWP_BASE_URL,
        glitchtip_dsn: process.env.GLITCHTIP_DSN || "",
        environment: isDevServer ? "development" : "production",
        commit_hash: `${gitBranch} (${commitHash})`,
      },
      // Need to block during local development for HMR:
      inject: isDevServer ? "head" : true,
      scriptLoading: isDevServer ? "blocking" : "defer",
    }),

    // Lint js files
    new ESLintPlugin({
      // lint only changed files:
      lintDirtyModulesOnly: true,
      // prevent warnings from stopping dev build
      emitWarning: false,
      // enable to auto-fix source files:
      // fix: true
    }),

    new CopyPlugin({
      patterns: [
        // Copy Shoelace assets to dist/shoelace
        {
          from: shoelaceAssetsSrcPath,
          to: path.resolve(__dirname, "dist", shoelaceAssetsPublicPath),
        },
      ],
    }),
  ],
};
