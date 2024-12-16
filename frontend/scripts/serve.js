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

const [devConfig] = require("../webpack.dev.js");

const app = express();

const { devServer } = devConfig;

devServer.setupMiddlewares([], { app });

Object.keys(devServer.proxy).forEach((path) => {
  app.use(
    path,
    createProxyMiddleware({
      ...devServer.proxy[path],
      target: `${devServer.proxy[path].target}/${path}`,
      changeOrigin: true,
    }),
  );
});
app.use("/", express.static(distPath));
app.get("/*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(9871, () => {
  console.log("Server listening on http://localhost:9871");
});
