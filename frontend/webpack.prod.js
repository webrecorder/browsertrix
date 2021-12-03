const { merge } = require("webpack-merge");

const common = require("./webpack.config.js");

module.exports = merge(common, {
  mode: "production",
  devtool: "source-map",

  optimization: {
    // chunkIds: "deterministic",
    // moduleIds: "deterministic",
    // concatenateModules: true,
    // flagIncludedChunks: true,
    // mangleExports: "deterministic",
    // removeAvailableModules: true,
    // runtimeChunk: "single",
    // splitChunks: {
    //   cacheGroups: {
    //     vendor: {
    //       test: /[\\/]node_modules[\\/]/,
    //       name: "vendor",
    //       chunks: "all",
    //     },
    //   },
    // },
  },
});
