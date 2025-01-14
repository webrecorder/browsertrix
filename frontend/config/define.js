/**
 * Global constants to make available to build
 *
 * @TODO Consolidate webpack and web-test-runner esbuild configs
 */
const path = require("path");

const isDevServer = process.env.WEBPACK_SERVE;

const dotEnvPath = path.resolve(
  process.cwd(),
  `.env${isDevServer ? `.local` : ""}`,
);
require("dotenv").config({
  path: dotEnvPath,
});

const WEBSOCKET_HOST =
  isDevServer && process.env.API_BASE_URL
    ? new URL(process.env.API_BASE_URL).host
    : process.env.WEBSOCKET_HOST || "";

module.exports = {
  "window.process.env.WEBSOCKET_HOST": JSON.stringify(WEBSOCKET_HOST),
};
