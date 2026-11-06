import { msg } from "@lit/localize";
import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import { type FilterChip } from "@/components/ui/filter-chip";
import { type SearchParamsValue } from "@/controllers/searchParamsValue";

enum FilterType {
  Prefix = "prefix",
  Regex = "regex",
}

export type FilterPageListBy = {
  urlPrefix?: string;
  urlRegex?: string;
};

export function pageListFilterControl(
  filterBy: SearchParamsValue<FilterPageListBy>,
) {
  const urlRegex = !!filterBy.value.urlRegex;

  return html`<div class="flex items-center gap-4">
    <div class="flex gap-2 items-center whitespace-nowrap">
      ${msg("Filter by:")}
      <btrix-filter-chip selectFromDropdown>
        ${msg("URL")}

        <div slot="dropdown-content" class="border rounded shadow-lg bg-white">
          <div
            class="flex flex-wrap justify-between items-center gap-2 pt-3 pb-1.5 px-3"
          >
            <div class="text-neutral-500 font-medium leading-5">
              ${msg("Filter by URL")}
            </div>
          </div>
          <form
            @reset=${(e: Event) => {
              const filterEl = (e.target as HTMLElement).closest<FilterChip>(
                "btrix-filter-chip",
              );

              filterEl?.hideDropdown();
            }}
            @submit=${(e: SubmitEvent) => {
              e.preventDefault();
            }}
          >
            <div class="px-3 pb-3 border-b">
              <sl-radio-group
                class="mb-3 part-[form-control-label]:sr-only"
                label=${msg("Filter type")}
                size="small"
                value=${urlRegex ? FilterType.Regex : FilterType.Prefix}
              >
                <sl-radio-button value=${FilterType.Prefix}
                  >${msg("Starts With")}</sl-radio-button
                >
                <sl-radio-button value=${FilterType.Regex}
                  >${msg("Custom Regex")}</sl-radio-button
                >
              </sl-radio-group>
              ${urlRegex
                ? html`<sl-input
                    class="part-[form-control-label]:sr-only w-[40ch]"
                    label=${msg("Filter value")}
                    size="small"
                    value=${ifDefined(filterBy.value.urlRegex)}
                  ></sl-input>`
                : html`<btrix-url-input
                    class="part-[form-control-label]:sr-only w-[40ch]"
                    label=${msg("Filter value")}
                    size="small"
                    placeholder="https://"
                    value=${ifDefined(filterBy.value.urlPrefix)}
                  ></btrix-url-input>`}
            </div>

            <div class="flex justify-between gap-2 flex-wrap p-3">
              <sl-button
                class="part-[label]:px-0"
                type="reset"
                variant="text"
                size="small"
                >${msg("Cancel")}</sl-button
              >
              <sl-button type="submit" variant="primary" size="small"
                >${msg("Apply")}</sl-button
              >
            </div>
          </form>
        </div>
      </btrix-filter-chip>
    </div>
  </div>`;
}
