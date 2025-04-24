import "@/global";
import "@/components/ui";

import {
  setCustomElementsManifest,
  type Preview,
} from "@storybook/web-components";

import customElements from "@/__generated__/custom-elements.json";

// Automatically document component properties
setCustomElementsManifest(customElements);

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
