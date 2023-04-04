// Serve app locally without building with webpack, e.g. for e2e
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const connectHistoryApiFallback = require("connect-history-api-fallback");
const devServerConfig = require("../config/dev-server.js");

const app = express();

devServerConfig.onBeforeSetupMiddleware({ app });

app.use("/", express.static("dist"));
Object.keys(devServerConfig.proxy).forEach((path) => {
  app.use(path, createProxyMiddleware(devServerConfig.proxy[path]));
});
app.use(connectHistoryApiFallback());

app.listen(9871);
