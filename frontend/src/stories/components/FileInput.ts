import { html, type TemplateResult } from "lit";

import type { FileInput } from "@/components/ui/file-input";

import "@/components/ui/file-input";

export type RenderProps = FileInput & {
  anchor: TemplateResult;
};

export const renderComponent = ({
  accept,
  multiple,
  dropzone,
  anchor,
}: Partial<RenderProps>) => {
  return html`
    <btrix-file-input
      .accept=${accept}
      ?multiple=${multiple}
      ?dropzone=${dropzone}
      @btrix-change=${console.log}
    >
      ${anchor}
    </btrix-file-input>
  `;
};
