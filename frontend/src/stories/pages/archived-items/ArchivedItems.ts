import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { CrawlsList } from "@/pages/org/archived-items";

import "@/features/archived-items";
import "@/pages/org/archived-items";

export type RenderProps = CrawlsList;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-archived-items
    ?isCrawler=${props.isCrawler}
    itemType=${ifDefined(props.itemType || undefined)}
  ></btrix-archived-items>`;
};
