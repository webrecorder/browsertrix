import { html } from "lit";

import type { BrowserProfilesList } from "@/pages/org/browser-profiles-list";

import "@/features/browser-profiles";
import "@/pages/org/browser-profiles-list";

export type RenderProps = BrowserProfilesList;

export const renderComponent = (_props: Partial<RenderProps>) => {
  return html`<btrix-browser-profiles-list></btrix-browser-profiles-list>`;
};
