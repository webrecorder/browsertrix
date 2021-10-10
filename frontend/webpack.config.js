// webpack.config.js
const path = require("path")


const backendUrl = new URL("http://btrix.cloud/");

module.exports = {
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.js",
    publicPath: "/"
  },

  module: {
    rules: [
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
  devServer: {
    watchFiles: ["src/*.js"],
    open: true,
    compress: true,
    hot: true,
    static: {
      directory: path.join(__dirname),
      //publicPath: "/",
      watch: true
    },
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: backendUrl.href,
        headers: {
          'Host': backendUrl.host
        },    
        pathRewrite: { '^/api': '' },
      },
    },
    port: 9870
  },
}
