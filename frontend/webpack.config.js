// @ts-check
// cSpell:ignore glitchtip
// webpack.config.js
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const CopyPlugin = require("copy-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const threadLoader = require("thread-loader");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const webpack = require("webpack");

const defineConfig = require("./config/define.js");
// @ts-ignore
const packageJSON = require("./package.json");

const isDevServer = process.env.WEBPACK_SERVE === "true";

const dotEnvPath = path.resolve(
  process.cwd(),
  `.env${isDevServer ? `.local` : ""}`,
);
require("dotenv").config({
  path: dotEnvPath,
});

const DOCS_URL = process.env.DOCS_URL
  ? new URL(process.env.DOCS_URL)
  : isDevServer
    ? "https://docs.browsertrix.com/"
    : "/docs/";

const OPENGRAPH_BASE_URL = process.env.OPENGRAPH_BASE_URL
  ? new URL(process.env.OPENGRAPH_BASE_URL)
  : "https://app.browsertrix.com/";

// Get git info for release version info

/**
 * @param {string} cmd
 * @param {string} defValue
 */
const execCommand = (cmd, defValue) => {
  try {
    return childProcess.execSync(cmd).toString().trim();
  } catch (e) {
    return defValue;
  }
};

// Local dev only
// Git branch and commit hash is used to add build info to error reporter when running locally
const gitBranch =
  process.env.GIT_BRANCH_NAME ||
  execCommand("git rev-parse --abbrev-ref HEAD", "unknown");

const commitHash =
  process.env.GIT_COMMIT_HASH ||
  execCommand("git rev-parse --short HEAD", "unknown");

const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets",
);
const shoelaceAssetsPublicPath = "shoelace/assets";

const version = (() => {
  if (process.env.VERSION) {
    return process.env.VERSION;
  }

  try {
    return fs.readFileSync("../version.txt", { encoding: "utf-8" }).trim();
  } catch (e) {
    /* empty */
  }

  return packageJSON.version;
})();

/** @type {Partial<import('ts-loader').Options>} */
const tsLoaderOptions = {
  onlyCompileBundledFiles: true,
  transpileOnly: true,
  // Enables compatibility with thread-loader
  happyPackMode: true,
};

const threadLoaderOptions = {
  poolTimeout: isDevServer ? Infinity : 2000,
};

threadLoader.warmup(threadLoaderOptions, ["ts-loader"]);

/** @type {import('webpack').Configuration} */
const main = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: `js/[name]${isDevServer ? "" : ".[contenthash]"}.js`,
    publicPath: "/",
    hashFunction: "xxhash64",
  },

  module: {
    rules: [
      // Non-generated source files
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, "src"),
        exclude: path.resolve(__dirname, "src/__generated__"),
        use: [
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                syntax: "postcss-lit",
                plugins: ["tailwindcss", "autoprefixer"],
              },
            },
          },
          {
            loader: "thread-loader",
            options: threadLoaderOptions,
          },
          {
            loader: "ts-loader",
            options: tsLoaderOptions,
          },
        ],
      },
      {
        // Generated source files
        test: /\.ts$/,
        include: path.resolve(__dirname, "src/__generated__"),
        use: [
          {
            loader: "thread-loader",
            options: threadLoaderOptions,
          },
          {
            loader: "ts-loader",
            options: tsLoaderOptions,
          },
        ],
      },
      {
        // Global styles and assets, like fonts and Shoelace,
        // that get added to document styles
        test: /\.css$/,
        include: [
          path.resolve(__dirname, "src"),
          path.resolve(__dirname, "node_modules/@shoelace-style/shoelace"),
        ],
        exclude: /\.stylesheet\.css$/,
        use: [
          "style-loader",
          { loader: "css-loader", options: { importLoaders: 1 } },
          "postcss-loader",
        ],
      },
      {
        // CSS loaded as raw string and used as a CSSStyleSheet
        test: /\.stylesheet\.css$/,
        type: "asset/source",
        include: [path.resolve(__dirname, "src")],
        use: ["postcss-loader"],
      },
      {
        test: /\.html$/,
        include: path.resolve(__dirname, "src"),
        loader: "html-loader",
      },
      {
        test: /\.(woff(2)?|ttf|svg|webp|avif)(\?v=\d+\.\d+\.\d+)?$/,
        include: path.resolve(__dirname, "src"),
        type: "asset/resource",
      },
    ],
  },

  resolve: {
    extensions: [".ts", ".js"],
    // @ts-ignore
    plugins: [new TsconfigPathsPlugin()],
  },

  plugins: [
    // Shim polyfill
    new webpack.ProvidePlugin({
      "Intl.DurationFormat": path.resolve(
        __dirname,
        "lib/intl-durationformat.js",
      ),
    }),

    new webpack.DefinePlugin(defineConfig),

    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 12,
    }),

    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configOverwrite: {
          exclude: [
            "**/*.test.ts",
            "tests/**/*.ts",
            "src/stories/**/*.ts",
            "playwright.config.ts",
          ],
        },
        // Re-enable type checking when `happyPackMode` is enabled
        diagnosticOptions: {
          semantic: true,
          syntactic: true,
        },
      },
    }),

    new HtmlWebpackPlugin({
      template: "src/index.ejs",
      templateParameters: {
        glitchtip_dsn: process.env.GLITCHTIP_DSN || "",
        environment: isDevServer ? "development" : "production",
        docsUrl: DOCS_URL,
        openGraphBaseUrl: OPENGRAPH_BASE_URL,
        version,
        gitBranch,
        commitHash,
      },
      // TODO this breaks shoelace forms, but seems HMR is broken anyway?
      // // Need to block during local development for HMR:
      // inject: isDevServer ? "head" : true,
      // scriptLoading: isDevServer ? "blocking" : "defer",
      inject: true,
      scriptLoading: "defer",
    }),

    new CopyPlugin({
      patterns: [
        // Copy Shoelace assets to dist/shoelace
        {
          from: shoelaceAssetsSrcPath,
          to: path.resolve(__dirname, "dist", shoelaceAssetsPublicPath),
        },
        // Copy custom icon library
        {
          from: path.resolve(__dirname, "src/assets/icons"),
          to: path.resolve(__dirname, "dist", "assets/icons"),
        },
        // Copy favicons to root
        {
          from: path.resolve(__dirname, "src/assets/favicons"),
          to: path.resolve(__dirname, "dist"),
        },
        // Copy app manifest
        {
          from: path.resolve(__dirname, "src/manifest.webmanifest"),
          to: path.resolve(__dirname, "dist"),
        },
        // Copy public contents
        {
          from: path.resolve(__dirname, "public"),
          to: path.resolve(__dirname, "dist"),
          noErrorOnMissing: true,
        },
      ],
    }),
    // @ts-ignore
    ...(process.env.BUNDLE_ANALYZER
      ? [new (require("webpack-bundle-analyzer").BundleAnalyzerPlugin)()]
      : []),
  ],
};

/** @type {import('webpack').Configuration} */
const vnc = {
  entry: "./node_modules/@novnc/novnc/core/rfb.js",
  experiments: { outputModule: true },
  output: {
    filename: "js/novnc.js",
    library: {
      type: "module",
    },
    hashFunction: "xxhash64",
  },
};
/** @type {[import('webpack').Configuration, import('webpack').Configuration]} */
module.exports = [main, vnc];
