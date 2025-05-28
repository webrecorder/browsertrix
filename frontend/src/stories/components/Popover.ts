import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Popover } from "@/components/ui/popover";

import "@/components/ui/popover";

export type RenderProps = Popover & { anchor: TemplateResult };

export const renderComponent = ({
  content,
  placement,
  open,
  anchor: triggerContent,
}: Partial<RenderProps>) => {
  return html`
    <btrix-popover
      content=${ifDefined(content)}
      placement=${ifDefined(placement)}
      trigger=${open ? "manual" : "hover"}
      ?open=${open}
    >
      ${triggerContent}
    </btrix-popover>
  `;
};
