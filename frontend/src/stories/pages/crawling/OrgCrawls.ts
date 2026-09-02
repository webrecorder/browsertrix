import { html } from "lit";

import type { OrgCrawls } from "@/pages/org/crawls";

import "@/features/crawl-workflows";
import "@/pages/org/crawls";

export type RenderProps = OrgCrawls;

export const renderComponent = (_props: Partial<RenderProps>) => {
  return html`<btrix-org-crawls></btrix-org-crawls>`;
};
