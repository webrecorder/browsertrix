import { html } from "lit";

import type { DedupeWorkflows } from "@/features/collections/dedupe-workflows/dedupe-workflows";

import "@/features/collections/dedupe-workflows/dedupe-workflows";
import "@/features/archived-items/item-dependency-tree";
import "@/features/archived-items/crawl-status";

export type RenderProps = DedupeWorkflows;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-dedupe-workflows
    .workflows=${props.workflows}
  ></btrix-dedupe-workflows>`;
};
