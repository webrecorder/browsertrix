const path = require("path");
const glob = require("glob");
const webpack = require("webpack");

module.exports = {
  resolve: {
    extensions: [".ts"],
  },
  entry: {
    locales: glob.sync("./src/__generated__/locales/*.ts"),
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
