const path = require("path");
require(path.resolve(process.cwd(), "./webpack.config.js"));

// for testing: for prod, the Dockerfile should have the official prod version used
const RWP_BASE_URL = process.env.RWP_BASE_URL || "https://replayweb.page/";

if (!process.env.API_BASE_URL) {
  throw new Error(
    "To run a dev frontend server, please set the API_BASE_URL pointing to your backend api server in '.env.local'"
  );
}

const devBackendUrl = new URL(process.env.API_BASE_URL);

module.exports = {
  proxy: {
    "/api": {
      target: devBackendUrl.href,
      headers: {
        Host: devBackendUrl.host,
      },
      ws: true,
    },

    "/data": {
      target: devBackendUrl.href,
      headers: {
        Host: devBackendUrl.host,
      },
    },
  },
  // Serve replay service worker file
  setupMiddlewares: (middlewares, server) => {
    middlewares.unshift({
      name: "replay-sw",
      middleware: (req, res) => {
        res.set("Content-Type", "application/javascript");
        res.send(`importScripts("${RWP_BASE_URL}sw.js")`);
      },
    });
  },
};
