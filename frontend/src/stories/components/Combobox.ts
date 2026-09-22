import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Combobox } from "@/components/ui/combobox";

import "@/components/ui/combobox";

export type RenderProps = Combobox & { content?: TemplateResult };

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-combobox
    name="storybook--combobox-form-example"
    label=${ifDefined(props.label)}
    placeholder=${ifDefined(props.placeholder)}
    helpText=${ifDefined(props.helpText)}
    value=${ifDefined(props.value)}
    defaultValue=${ifDefined(props.defaultValue)}
    ?required=${props.required}
    ?disabled=${props.disabled}
    ?open=${props.open}
    ?clearable=${props.clearable}
    @btrix-select-new=${console.debug}
    @btrix-change=${console.debug}
    @btrix-hide=${console.debug}
    @btrix-after-hide=${console.debug}
    @btrix-show=${console.debug}
    @btrix-after-show=${console.debug}
  >
    ${props.content}
  </btrix-combobox>`;
};
