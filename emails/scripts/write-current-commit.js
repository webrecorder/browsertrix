// Writes the current commit hash to a file
import fs from "fs";
import { execSync } from "child_process";

const commitHash = execSync("git rev-parse HEAD").toString().trim();
fs.writeFileSync(
  "dist/current-commit.js",
  `export default ${JSON.stringify(commitHash)};`,
);
