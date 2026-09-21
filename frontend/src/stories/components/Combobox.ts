import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Combobox } from "@/components/ui/combobox";

import "@/components/ui/combobox";

export type RenderProps = Combobox & { content?: TemplateResult };

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-combobox
    label=${ifDefined(props.label)}
    value=${ifDefined(props.value)}
    displayValue=${ifDefined(props.displayValue)}
    ?open=${props.open}
    ?clearable=${props.clearable}
    @btrix-select=${console.debug}
    @btrix-hide=${console.debug}
    @btrix-after-hide=${console.debug}
    @btrix-show=${console.debug}
    @btrix-after-show=${console.debug}
  >
    ${props.content}
  </btrix-combobox>`;
};
