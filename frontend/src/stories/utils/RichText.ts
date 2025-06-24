import { html } from "lit";

import { richText } from "@/utils/rich-text/rich-text";

export type RenderProps = { content: string; linkClass?: string };

export const renderComponent = ({ content, linkClass }: RenderProps) => {
  return html`${richText(content, linkClass)}`;
};
