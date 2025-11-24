import { html } from "lit";

import type { TagContainer } from "@/components/ui/tag-container";

import "@/components/ui/tag-container";

export type RenderProps = TagContainer;

export const renderComponent = ({ tags }: Partial<RenderProps>) => {
  return html`<btrix-tag-container .tags=${tags || []}></btrix-tag-container>`;
};
