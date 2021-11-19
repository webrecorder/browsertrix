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
          },
        },
      },
    }),
  ],
};
