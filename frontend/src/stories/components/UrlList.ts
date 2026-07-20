import { html } from "lit";

import type { UrlList } from "@/components/ui/url-list";

import "@/components/ui/url-list";

export type RenderProps = UrlList;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-url-list .urls=${props.urls || []}></btrix-url-list>`;
};
