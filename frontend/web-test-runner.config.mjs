import { esbuildPlugin } from "@web/dev-server-esbuild";
import { importMapsPlugin } from "@web/dev-server-import-maps";

export default {
  plugins: [
    esbuildPlugin({ ts: true }),
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
