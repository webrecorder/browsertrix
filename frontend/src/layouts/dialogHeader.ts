import { html, nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

/**
 * Classnames needed for dialog header to render correctly
 *
 * @example Usage:
 * ```ts
 * <btrix-dialog class=${dialogHeaderClasses}></btrix-dialog>
 * ```
 */
export const dialogClassesForHeader = tw`part-[title]:overflow-hidden`;

/**
 * Label for `<btrix-dialog>` with optional subtitle.
 */
export function dialogLabel({
  title,
  subtitle,
  helpText,
}: {
  title: string | TemplateResult;
  subtitle?: string | TemplateResult;
  helpText?: string | TemplateResult;
}) {
  return html`<div slot="label" class="flex items-center gap-3 divide-x">
    <div class="whitespace-nowrap">${title}</div>
    ${subtitle
      ? html`<div class="truncate px-3 text-sm leading-none text-neutral-500">
          ${subtitle}
        </div>`
      : nothing}
    ${helpText
      ? html`
          <btrix-popover slot="header-actions" placement="bottom-end" hoist>
            <div slot="content">${helpText}</div>
            <sl-icon name="question-circle" class="text-neutral-600"></sl-icon>
          </btrix-popover>
        `
      : nothing}
  </div>`;
}

/**
 * "Help" icon with popover in `<btrix-dialog>` header.
 */
export function dialogHelpPopover({
  content,
}: {
  content: string | TemplateResult;
}) {
  return html`<btrix-popover slot="header-actions" placement="bottom-end" hoist>
    <div slot="content">${content}</div>
    <sl-icon name="question-circle" class="text-neutral-600"></sl-icon
  ></btrix-popover>`;
}
