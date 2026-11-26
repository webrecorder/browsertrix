import { html } from "lit";

import type { WorkflowsList } from "@/pages/org/workflows-list";

import "@/features/crawl-workflows";
import "@/pages/org/workflows-list";

export type RenderProps = WorkflowsList;

export const renderComponent = (_props: Partial<RenderProps>) => {
  return html`<btrix-workflows-list></btrix-workflows-list>`;
};
