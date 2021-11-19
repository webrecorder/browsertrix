// webpack.config.js
const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");

const isDevServer = process.env.WEBPACK_SERVE;

require("dotenv").config({
  path: path.resolve(process.cwd(), `.env${isDevServer ? `.local` : ""}`),
});

const backendUrl = new URL(process.env.API_BASE_URL || "http://btrix.cloud/");

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
    static: {
      directory: path.join(__dirname),
      //publicPath: "/",
      watch: true,
    },
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
    // Lint js files
    new ESLintPlugin({
      // lint only changed files:
      lintDirtyModulesOnly: true,
      // prevent warnings from stopping dev build
      emitWarning: false,
      // enable to auto-fix source files:
      // fix: true
    }),
  ],
};
