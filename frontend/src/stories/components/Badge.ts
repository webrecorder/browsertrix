import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Badge } from "@/components/ui/badge";

import "@/components/ui/badge";

export type RenderProps = Badge & { content: string | TemplateResult };

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-badge
    variant=${ifDefined(props.variant)}
    size=${ifDefined(props.size)}
    ?outline=${props.outline}
    ?pill=${props.pill}
    ?asLabel=${props.asLabel}
  >
    ${props.content}
  </btrix-badge>`;
};
