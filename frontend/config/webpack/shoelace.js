// @ts-check
const path = require("path");

const shoelaceAssetsSrcPath = path.resolve(
  __dirname,
  "../..",
  "node_modules/@shoelace-style/shoelace/dist/assets",
);
const shoelaceAssetsPublicPath = "shoelace/assets";

module.exports = {
  shoelaceAssetsSrcPath,
  shoelaceAssetsPublicPath,
};
