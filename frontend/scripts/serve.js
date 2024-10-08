// Serve app locally without building with webpack, e.g. for e2e
const path = require("path");

const connectHistoryApiFallback = require("connect-history-api-fallback");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const dotEnvPath = path.resolve(process.cwd(), ".env.local");
require("dotenv").config({
  path: dotEnvPath,
});

const [devConfig] = require("../webpack.dev.js");

const app = express();

const { devServer } = devConfig;

devServer.setupMiddlewares([], { app });

app.use("/", express.static("dist"));
Object.keys(devServer.proxy).forEach((path) => {
  app.use(path, createProxyMiddleware(devServer.proxy[path]));
});
app.use(connectHistoryApiFallback());

app.listen(9871);
