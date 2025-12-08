import "@/global";
import "@/components/ui";

import {
  setCustomElementsManifest,
  type Preview,
} from "@storybook/web-components";
import { delay, http, HttpResponse } from "msw";
import { initialize, mswLoader } from "msw-storybook-addon";

// eslint-disable-next-line import-x/no-unresolved -- File is generated at build time
import customElements from "@/__generated__/custom-elements.json";

import "../src/theme.stylesheet.css";

// Automatically document component properties
setCustomElementsManifest(customElements);

// Initialize mock service worker
initialize();

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    msw: {
      handlers: [
        // Mock all API requests by default
        http.get(/\/api\//, async () => {
          await delay(500);
          return new HttpResponse(null);
        }),
      ],
    },
  },
};

export default preview;
