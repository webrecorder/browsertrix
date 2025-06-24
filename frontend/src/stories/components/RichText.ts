import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { RichText } from "@/components/utils/rich-text";

import "@/components/utils/rich-text";

export type RenderProps = RichText;

export const renderComponent = ({ content, linkClass }: RenderProps) => {
  return html`
    <btrix-rich-text
      content=${ifDefined(content)}
      linkClass=${ifDefined(linkClass)}
    >
    </btrix-rich-text>
  `;
};
