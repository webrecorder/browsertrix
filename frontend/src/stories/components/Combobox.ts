import { html, type TemplateResult } from "lit";

// import { ifDefined } from "lit/directives/if-defined.js";

import type { Combobox } from "@/components/ui/combobox";

import "@/components/ui/combobox";

export type RenderProps = Combobox & { content?: TemplateResult };

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-combobox ?open=${props.open}>
    ${props.content}
  </btrix-combobox>`;
};
