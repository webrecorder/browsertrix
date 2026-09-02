import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function listControls({
  renderSearchControl,
  renderSortControl,
  renderViewControl,
  renderFilterControl,
}: {
  renderSearchControl: () => TemplateResult;
  renderSortControl: () => TemplateResult;
  renderViewControl?: () => TemplateResult;
  renderFilterControl?: () => TemplateResult;
}) {
  return html`
    <div
      class="sticky top-2 z-10 mb-3 flex flex-col gap-3 rounded-lg border bg-neutral-50 p-3"
    >
      <div
        class=${clsx(
          tw`grid items-center gap-3`,
          renderViewControl
            ? tw`grid-cols-[1fr_fit-content(100%)] lg:grid-cols-[minmax(0,100%)_fit-content(100%)_fit-content(100%)]`
            : tw`grid-cols-1 md:grid-cols-[minmax(0,100%)_fit-content(100%)]`,
        )}
      >
        <div
          class=${clsx(
            renderViewControl ? tw`col-span-2 lg:col-span-1` : tw`col-span-1`,
          )}
        >
          ${renderSearchControl()}
        </div>
        <div class="col-span-1 flex items-center">
          <label
            class="mr-2 whitespace-nowrap text-sm text-neutral-500"
            for="sort-select"
          >
            ${msg("Sort by:")}
          </label>
          ${renderSortControl()}
        </div>

        ${renderViewControl
          ? html`<div class="col-span-1 flex items-center">
              <label
                class="mr-2 whitespace-nowrap text-sm text-neutral-500"
                for="view-select"
              >
                ${msg("View:")}
              </label>
              ${renderViewControl()}
            </div>`
          : nothing}
      </div>
      ${renderFilterControl
        ? html`<div class="flex flex-wrap items-center gap-2">
            <span class="whitespace-nowrap text-sm text-neutral-500">
              ${msg("Filter by:")}
            </span>
            ${renderFilterControl()}
          </div>`
        : nothing}
    </div>
  `;
}
