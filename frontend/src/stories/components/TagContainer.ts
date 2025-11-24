import { html, type TemplateResult } from "lit";

import type { TagContainer } from "@/components/ui/tag-container";

import "@/components/ui/tag-container";

export type RenderProps = TagContainer & { content: TemplateResult };

export const renderComponent = ({ content }: Partial<RenderProps>) => {
  return html`<btrix-tag-container>${content}</btrix-tag-container>`;
};
