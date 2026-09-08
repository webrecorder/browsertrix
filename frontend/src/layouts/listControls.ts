import { msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function listControls({
  renderSearchControl,
  renderSortControl,
  renderViewControl,
  renderFilterControl,
  renderBulkActionsControl,
}: {
  renderSearchControl: () => TemplateResult;
  renderSortControl: () => TemplateResult;
  renderViewControl?: () => TemplateResult;
  renderFilterControl?: () => TemplateResult;
  renderBulkActionsControl?: () => TemplateResult;
}) {
  return html`
    <div
      class="sticky top-2 z-10 mb-3 flex flex-col gap-2 rounded-lg border bg-neutral-50 p-2.5 @container/controls lg:gap-3 lg:px-3.5 lg:py-3"
    >
      <div
        class=${clsx(
          tw`grid items-center gap-x-3 gap-y-2 lg:gap-y-2`,
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
      ${renderFilterControl || renderBulkActionsControl
        ? html`<div
            class="relative flex flex-col gap-y-2 overflow-hidden @3xl/controls:gap-y-0"
          >
            ${renderBulkActionsControl
              ? html`<div
                  class=${clsx(
                    tw`peer hidden items-center gap-2 text-neutral-500 @3xl/controls:absolute @3xl/controls:flex @3xl/controls:h-full @3xl/controls:translate-y-full @3xl/controls:opacity-0 @3xl/controls:transition-all @3xl/controls:delay-75`,
                    tw`@3xl/controls:hover:translate-y-0 @3xl/controls:hover:opacity-100`,
                    tw`@3xl/controls:has-[sl-checkbox[checked]]:translate-y-0 @3xl/controls:has-[sl-checkbox[checked]]:opacity-100`,
                    tw`@3xl/controls:has-[sl-checkbox[indeterminate]]:translate-y-0 @3xl/controls:has-[sl-checkbox[indeterminate]]:opacity-100`,
                  )}
                >
                  ${renderBulkActionsControl()}
                </div>`
              : nothing}
            ${renderFilterControl
              ? html`<div
                  class=${clsx(
                    tw`flex flex-wrap items-center gap-2`,
                    renderBulkActionsControl && [
                      tw`order-first @3xl/controls:transition-all @3xl/controls:delay-75`,
                      tw`@3xl/controls:peer-hover:-translate-y-full @3xl/controls:peer-hover:opacity-0 @3xl/controls:peer-hover:delay-0`,
                      tw`@3xl/controls:peer-has-[sl-checkbox[checked]]:-translate-y-full @3xl/controls:peer-has-[sl-checkbox[checked]]:opacity-0 @3xl/controls:peer-has-[sl-checkbox[checked]]:delay-0`,
                      tw`@3xl/controls:peer-has-[sl-checkbox[indeterminate]]:-translate-y-full @3xl/controls:peer-has-[sl-checkbox[indeterminate]]:opacity-0 @3xl/controls:peer-has-[sl-checkbox[indeterminate]]:delay-75`,
                    ],
                  )}
                >
                  <span class="whitespace-nowrap text-sm text-neutral-500">
                    ${msg("Filter by:")}
                  </span>
                  ${renderFilterControl()}
                </div>`
              : nothing}
          </div>`
        : nothing}
      ${renderBulkActionsControl
        ? html`<div
            class=${clsx(
              tw`fixed inset-x-3.5 bottom-3 z-10 hidden min-h-10 items-center gap-2 rounded-lg border bg-neutral-50 px-3 shadow`,
              tw`has-[sl-checkbox[checked]]:flex @3xl/controls:has-[sl-checkbox[checked]]:hidden`,
              tw`has-[sl-checkbox[indeterminate]]:flex @3xl/controls:has-[sl-checkbox[indeterminate]]:hidden`,
            )}
          >
            ${renderBulkActionsControl()}
          </div>`
        : nothing}
    </div>
  `;
}
