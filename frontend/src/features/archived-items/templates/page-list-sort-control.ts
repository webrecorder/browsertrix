import { msg } from "@lit/localize";
import { html } from "lit";

import { type SearchParamsValue } from "@/controllers/searchParamsValue";
import { SortDirection } from "@/types/utils";
import { type SortableFields, type SortBy } from "@/utils/searchParams/sortBy";

export type SortField = "ts" | "title" | "url";
export const sortableFields = {
  ts: {
    label: msg("Snapshot Time"),
    defaultDirection: SortDirection.Ascending,
  },
  title: {
    label: msg("Title"),
    defaultDirection: SortDirection.Ascending,
  },
  url: {
    label: msg("URL"),
    defaultDirection: SortDirection.Ascending,
  },
} as const satisfies SortableFields<SortField>;

export const DEFAULT_SORT_BY = {
  field: "ts",
  direction: sortableFields["ts"].defaultDirection,
} as const satisfies SortBy<SortField>;

export function pageListSortControl(
  orderBy: SearchParamsValue<SortBy<SortField>>,
) {
  return html`<div class="flex items-center">
    <sl-select
      class="part-[form-control]:flex part-[form-control]:gap-2 part-[form-control]:items-center part-[form-control-label]:mb-0 part-[form-control-label]:text-sm part-[form-control-label]:text-neutral-500 part-[form-control-label]:whitespace-nowrap"
      size="small"
      label=${msg("Sort by:")}
      value=${orderBy.value.field}
      pill
      @sl-change=${(e: Event) => {
        const field = (e.target as HTMLSelectElement).value as SortField;
        orderBy.setValue({
          field,
          direction: sortableFields[field].defaultDirection,
        });
      }}
    >
      ${Object.entries(sortableFields).map(
        ([value, { label }]) => html`
          <sl-option value=${value}>${label}</sl-option>
        `,
      )}
    </sl-select>
    <sl-tooltip
      content=${orderBy.value.direction === SortDirection.Ascending
        ? msg("Sort in descending order")
        : msg("Sort in ascending order")}
    >
      <sl-icon-button
        name=${orderBy.value.direction === SortDirection.Ascending
          ? "sort-up-alt"
          : "sort-down"}
        class="text-base"
        label=${orderBy.value.direction === SortDirection.Ascending
          ? msg("Sort Descending")
          : msg("Sort Ascending")}
        @click=${() => {
          orderBy.setValue({
            ...orderBy.value,
            direction: orderBy.value.direction * -1,
          });
        }}
      ></sl-icon-button>
    </sl-tooltip>
  </div>`;
}
