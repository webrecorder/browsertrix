import { msg } from "@lit/localize";
import { html, nothing, type TemplateResult } from "lit";

export function listControls({
  renderSearchControl,
  renderSortControl,
  renderViewControl,
  renderFilterControl,
}: {
  renderSearchControl?: () => TemplateResult;
  renderSortControl?: () => TemplateResult;
  renderViewControl?: () => TemplateResult;
  renderFilterControl?: () => TemplateResult;
}) {
  return html`
    <div class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-3">
      <div class="flex flex-wrap items-center gap-2 md:gap-3">
        ${renderSearchControl
          ? html`<div class="grow basis-2/3">${renderSearchControl()}</div>`
          : nothing}
        ${renderSortControl
          ? html`<div class="flex items-center">
              <label
                class="mr-2 whitespace-nowrap text-sm text-neutral-500"
                for="sort-select"
              >
                ${msg("Sort by:")}
              </label>
              ${renderSortControl()}
            </div>`
          : nothing}
        ${renderViewControl
          ? html`<div class="flex items-center">
              <label
                class="mr-2 whitespace-nowrap text-sm text-neutral-500"
                for="view-select"
              >
                ${msg("View:")}
              </label>
              ${renderViewControl()}
            </div>`
          : nothing}
        ${renderFilterControl
          ? html`<div class="flex flex-wrap items-center gap-2">
              <span class="whitespace-nowrap text-sm text-neutral-500">
                ${msg("Filter by:")}
              </span>
              ${renderFilterControl()}
            </div>`
          : nothing}
      </div>
    </div>
  `;
}
