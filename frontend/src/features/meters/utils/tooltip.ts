import { html, type TemplateResult } from "lit";

export const tooltipContent = ({
  title,
  value,
  content,
}: {
  title: string | TemplateResult;
  value: string | TemplateResult;
  content: string | TemplateResult | undefined;
}) =>
  html`<header class="flex justify-between gap-4 font-medium leading-none">
      <span>${title}</span>
      <span>${value}</span>
    </header>
    <hr class="my-2" />
    ${content}`;
