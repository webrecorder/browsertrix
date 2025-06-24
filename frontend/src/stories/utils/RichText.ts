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
    // Hack: Storybook seems to convert null to undefined, so instead I'm using the string "null" and converting it back to null here
    // -ESG
    maxLength: (maxLength as unknown as string) === "null" ? null : maxLength,
  })}`;
};
