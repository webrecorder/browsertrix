import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { formControlName } from "./decorators/fileInputForm";

import type { FileInput } from "@/components/ui/file-input";

import "@/components/ui/file-input";

export type RenderProps = FileInput & {
  content: TemplateResult;
};

export const renderComponent = ({
  label,
  accept,
  multiple,
  drop,
  content,
}: Partial<RenderProps>) => {
  return html`
    <btrix-file-input
      name=${formControlName}
      label=${ifDefined(label)}
      .accept=${accept}
      ?multiple=${multiple}
      ?drop=${drop}
      @btrix-change=${console.log}
    >
      ${content}
    </btrix-file-input>
  `;
};
