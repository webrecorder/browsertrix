/* eslint-env node */
import { fileURLToPath } from "url";

import commonjsPlugin from "@rollup/plugin-commonjs";
import { esbuildPlugin } from "@web/dev-server-esbuild";
import { importMapsPlugin } from "@web/dev-server-import-maps";
import { fromRollup } from "@web/dev-server-rollup";
import { playwrightLauncher } from "@web/test-runner-playwright";
import glob from "glob";
import { typescriptPaths as typescriptPathsPlugin } from "rollup-plugin-typescript-paths";

import defineConfig from "./config/define.js";

const commonjs = fromRollup(commonjsPlugin);
const typescriptPaths = fromRollup(typescriptPathsPlugin);

// Map css and assert imports to mock file
const emptyImports = {};
glob.sync("./src/**/*.css").forEach((filepath) => {
  emptyImports[filepath] = fileURLToPath(
    new URL("./src/__mocks__/_empty.js", import.meta.url),
  );
});
glob.sync("./src/assets/**/*").forEach((filepath) => {
  // Enable "~assets" imports, which doesn't work with `rollup-plugin-typescript-paths`
  const aliasedImportPath = filepath.replace("./src/", "~");

  emptyImports[aliasedImportPath] = fileURLToPath(
    new URL("./src/__mocks__/_empty.js", import.meta.url),
  );
});

export default {
  nodeResolve: true,
  rootDir: process.cwd(),
  browsers: [
    playwrightLauncher({
      product: "chromium",
      launchOptions: {
        channel: "chromium",
      },
      async createBrowserContext({ browser }) {
        return browser.newContext({ timezoneId: "Pacific/Easter" });
      },
    }),
  ],
  plugins: [
    typescriptPaths({
      preserveExtensions: true,
      absolute: false,
      nonRelative: true, // needed for non-ts files
      transform(path) {
        return `/${path}`;
      },
    }),
    esbuildPlugin({
      ts: true,
      json: true,
      tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      target: "esnext",
      define: defineConfig,
    }),
    commonjs({
      include: [
        // web-test-runner expects es modules,
        // include umd/commonjs modules here:
        "node_modules/url-pattern/**/*",
        "node_modules/lodash/**/*",
        "node_modules/color/**/*",
        "node_modules/cronstrue/**/*",
        "node_modules/slugify/**/*",
        "node_modules/parse-ms/**/*",
        "node_modules/regex-colorize/**/*",
        "node_modules/@formatjs/intl-durationformat/**/*",
        "node_modules/@floating-ui/**/*",
      ],
    }),
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            ...emptyImports,
            "./src/shoelace": fileURLToPath(
              new URL("./src/__mocks__/shoelace.js", import.meta.url),
            ),
            "tailwindcss/tailwind.css": fileURLToPath(
              new URL("./src/__mocks__/_empty.js", import.meta.url),
            ),
            "@shoelace-style/shoelace/dist/themes/light.css": fileURLToPath(
              new URL("./src/__mocks__/_empty.js", import.meta.url),
            ),
          },
        },
      },
    }),
  ],
};
