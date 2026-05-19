import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { Prose } from "@/components/ui/prose";

import "@/components/ui/prose";

export type RenderProps = Prose & {
  content: string | TemplateResult;
  class?: string;
};

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-prose class=${ifDefined(props.class)}
    >${props.content}</btrix-prose
  >`;
};
