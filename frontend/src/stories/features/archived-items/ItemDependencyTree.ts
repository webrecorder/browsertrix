import { html } from "lit";

// import { ifDefined } from "lit/directives/if-defined.js";

import type { ItemDependencyTree } from "@/features/archived-items/item-dependency-tree/item-dependency-tree";

import "@/features/archived-items/item-dependency-tree";
import "@/features/archived-items/crawl-status";

export type RenderProps = ItemDependencyTree;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-item-dependency-tree
    .items=${props.items}
  ></btrix-item-dependency-tree>`;
};
