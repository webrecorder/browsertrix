// webpack.config.js
const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");

const isDevServer = process.env.WEBPACK_SERVE;
const dotEnvPath = path.resolve(
  process.cwd(),
  `.env${isDevServer ? `.local` : ""}`
);

require("dotenv").config({
  path: dotEnvPath,
});

// TODO actual prod URL
const backendUrl = new URL(process.env.API_BASE_URL || "http://btrix.cloud/");
const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "node_modules/@shoelace-style/shoelace/dist/assets"
);
const shoelaceAssetsPublicPath = "/shoelace/assets";

module.exports = {
  entry: "./src/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.js",
    publicPath: "/",
  },

  devtool: "inline-source-map",

  module: {
    rules: [
      {
        test: /\.ts$/,
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
        publicPath: shoelaceAssetsPublicPath,
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
    port: 9870,
  },

  plugins: [
    new Dotenv({ path: dotEnvPath }),

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
