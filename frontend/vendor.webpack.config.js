/**
 * Separate vendor modules to speed up rebuild
 */
const path = require("path");
const webpack = require("webpack");

module.exports = {
  resolve: {
    extensions: [".ts"],
  },
  entry: {
    lit: ["lit", "@lit/localize"],
  },
  output: {
    path: path.join(__dirname, "dist/vendor"),
    filename: "dll.[name].js",
    library: "[name]_[fullhash]",
  },
  plugins: [
    new webpack.DllPlugin({
      path: path.join(__dirname, "dist/vendor", "[name]-manifest.json"),
      name: "[name]_[fullhash]",
    }),
  ],
};
