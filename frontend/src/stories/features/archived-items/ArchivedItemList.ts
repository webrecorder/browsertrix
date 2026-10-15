import { html, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { ArchivedItemList } from "@/features/archived-items/archived-item-list/archived-item-list";

import "@/features/archived-items";

export type RenderProps = ArchivedItemList & {
  content?: TemplateResult | TemplateResult<1> | TemplateResult<1>[];
};

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-archived-item-list
    listType=${ifDefined(props.listType || undefined)}
  >
    ${props.content}
  </btrix-archived-item-list>`;
};
