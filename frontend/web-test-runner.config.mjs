import { esbuildPlugin } from "@web/dev-server-esbuild";
import { importMapsPlugin } from "@web/dev-server-import-maps";
import commonjsPlugin from "@rollup/plugin-commonjs";
import { fromRollup } from "@web/dev-server-rollup";
import { fileURLToPath } from "url";

const commonjs = fromRollup(commonjsPlugin);

export default {
  plugins: [
    esbuildPlugin({
      ts: true,
      // tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      target: "auto",
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
            "tailwindcss/tailwind.css": "/src/__mocks__/css.js",
            "@shoelace-style/shoelace/dist/themes/light.css":
              "/src/__mocks__/css.js",
            "@formatjs/intl-displaynames/should-polyfill":
              "/src/__mocks__/@formatjs/intl-displaynames/should-polyfill.js",
            color: "/src/__mocks__/color.js",
          },
        },
      },
    }),
  ],
};
