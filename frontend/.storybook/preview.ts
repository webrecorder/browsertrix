import "../src/global";

import {
  setCustomElementsManifest,
  type Preview,
} from "@storybook/web-components";

import customElements from "../src/__generated__/custom-elements.json";

// Automatically document component properties
setCustomElementsManifest(customElements);

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
