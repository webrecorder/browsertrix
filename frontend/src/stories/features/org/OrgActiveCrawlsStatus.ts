import { html } from "lit";

import type { OrgActiveCrawlsStatus } from "@/features/org/org-active-crawls-status";

import "@/features/org/org-active-crawls-status";

export type RenderProps = OrgActiveCrawlsStatus;

export const renderComponent = (_props: Partial<RenderProps>) => {
  return html`<btrix-org-active-crawls-status></btrix-org-active-crawls-status>`;
};
