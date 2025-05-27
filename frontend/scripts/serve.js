// @ts-check
// Serve app locally without building with webpack, e.g. for e2e
const fs = require("fs");
const path = require("path");

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const distPath = path.join(process.cwd(), "dist");
if (!fs.existsSync(path.join(distPath, "index.html"))) {
  throw new Error("dist folder is missing");
}

const dotEnvPath = path.resolve(process.cwd(), ".env.local");
require("dotenv").config({
  path: dotEnvPath,
});

const devConfigs = require("../webpack.dev.js");
const [devConfig] = devConfigs;

const app = express();

/** @type {import('webpack').Configuration['devServer']} */
const devServer = devConfig.devServer;

if (!devServer) {
  throw new Error("Dev server not defined in `webpack.dev.js`");
}

if (devServer.setupMiddlewares) {
  // @ts-ignore Express app is compatible with `Server`
  devServer.setupMiddlewares([], { app });
}

if (Array.isArray(devServer.proxy)) {
  devServer.proxy.forEach((proxy) => {
    app.use(
      // @ts-ignore
      proxy.context,
      createProxyMiddleware({
        ...proxy,
        followRedirects: true,
      }),
    );
  });
}

app.use("/", express.static(distPath));
app.get("/*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(9871, () => {
  console.log("Server listening on http://localhost:9871");
});
