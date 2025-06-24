import { html } from "lit";

import { richText } from "@/utils/rich-text";

export type RenderProps = {
  content: string;
  linkClass?: string;
  shortenOnly?: boolean;
  maxLength?: number | null;
};

export const renderComponent = ({
  content,
  linkClass,
  shortenOnly,
  maxLength,
}: RenderProps) => {
  return html`${richText(content, {
    linkClass,
    shortenOnly,
    // Hack: convert "null" back to null (see note in RichText.stories.ts)
    maxLength: (maxLength as unknown as string) === "null" ? null : maxLength,
  })}`;
};
