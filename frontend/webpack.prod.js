const { merge } = require("webpack-merge");

const common = require("./webpack.config.js");

module.exports = merge(common, {
  mode: "production",
  devtool: "source-map",

  // TODO figure out minifying lit templates
  optimization: {
    splitChunks: {
      // Split both async and non-async chunks (only async by default)
      chunks: "all",
    },
  },
});
