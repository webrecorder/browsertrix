import { html, nothing, type TemplateResult } from "lit";

/**
 * Render a full page error, like 404 or 500 for primary resources.
 */
export function pageError({
  heading,
  detail,
  primaryAction,
  secondaryAction,
}: {
  heading: string | TemplateResult;
  detail: string | TemplateResult;
  primaryAction: TemplateResult;
  secondaryAction?: TemplateResult;
}) {
  return html`
    <div class="text-center">
      <p
        class="mx-auto my-4 max-w-max border-b py-4 text-xl leading-none text-neutral-500"
      >
        ${heading}
      </p>
      <p class="text-neutral-600">${detail}</p>
      <div class="my-4">${primaryAction}</div>
      ${secondaryAction
        ? html`<p class="text-neutral-500">${secondaryAction}</p>`
        : nothing}
    </div>
  `;
}
