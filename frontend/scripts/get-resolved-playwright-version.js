const fs = require("fs");

const lockfile = require("@yarnpkg/lockfile");

let file = fs.readFileSync("yarn.lock", "utf8");
let json = lockfile.parse(file);

console.log(
  Object.entries(json.object).find(([pkg]) =>
    pkg.startsWith("@playwright/test"),
  )[1].version,
);
