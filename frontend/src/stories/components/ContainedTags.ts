import { html, type TemplateResult } from "lit";

import type { ContainedTags } from "@/components/ui/contained-tags";

import "@/components/ui/contained-tags";

export type RenderProps = ContainedTags & { content: TemplateResult };

export const renderComponent = ({ content }: Partial<RenderProps>) => {
  return html`<btrix-contained-tags>${content}</btrix-contained-tags>`;
};
