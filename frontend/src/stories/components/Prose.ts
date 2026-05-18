import { html, type TemplateResult } from "lit";

import type { Prose } from "@/components/ui/prose";

import "@/components/ui/prose";

export type RenderProps = Prose & { content: string | TemplateResult };

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-prose>${props.content}</btrix-prose>`;
};
