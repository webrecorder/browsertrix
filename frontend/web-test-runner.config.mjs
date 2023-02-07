import { esbuildPlugin } from "@web/dev-server-esbuild";
import { importMapsPlugin } from "@web/dev-server-import-maps";
import commonjsPlugin from "@rollup/plugin-commonjs";
import { fromRollup } from "@web/dev-server-rollup";
import { fileURLToPath } from "url";
import glob from "glob";

const commonjs = fromRollup(commonjsPlugin);

// Map all css imports to mock file
const cssImports = {};
glob.sync("./src/**/*.css").forEach((filepath) => {
  cssImports[filepath] = fileURLToPath(
    new URL("./src/__mocks__/css.js", import.meta.url)
  );
});

export default {
  nodeResolve: true,
  rootDir: process.cwd(),
  plugins: [
    esbuildPlugin({
      ts: true,
      tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      target: "esnext",
    }),
    commonjs({
      include: [
        // web-test-runner expects es modules,
        // include umd/commonjs modules here:
        "node_modules/url-pattern/**/*",
      ],
    }),
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            ...cssImports,
            "./src/shoelace": fileURLToPath(
              new URL("./src/__mocks__/shoelace.js", import.meta.url)
            ),
            "tailwindcss/tailwind.css": fileURLToPath(
              new URL("./src/__mocks__/css.js", import.meta.url)
            ),
            "@shoelace-style/shoelace/dist/themes/light.css": fileURLToPath(
              new URL("./src/__mocks__/css.js", import.meta.url)
            ),
            // FIXME: `@web/dev-server-esbuild` or its dependencies seem to be ignoring .js
            // extension and shoelace exports and switching it to .ts
            // Needs a better solution than import mapping individual files.
            // Maybe related:
            // - https://github.com/modernweb-dev/web/issues/1929
            // - https://github.com/modernweb-dev/web/issues/224
            "@shoelace-style/shoelace/dist/utilities/form.js": fileURLToPath(
              new URL(
                "./node_modules/@shoelace-style/shoelace/dist/utilities/form.js",
                import.meta.url
              )
            ),
            // "@formatjs/intl-displaynames/should-polyfill": new URL(
            //   "./src/__mocks__/@formatjs/intl-displaynames/should-polyfill.js",
            //   import.meta.url
            // ),
            color: fileURLToPath(
              new URL("./src/__mocks__/color.js", import.meta.url)
            ),
          },
        },
      },
    }),
  ],
};
