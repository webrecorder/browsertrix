import { msg } from "@lit/localize";
import type {
  SlChangeEvent,
  SlInput,
  SlRadioGroup,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import { type FilterChip } from "@/components/ui/filter-chip";
import { type SearchParamsValue } from "@/controllers/searchParamsValue";
import { regexEscape, regexUnescape } from "@/utils/string";

enum FilterType {
  Prefix = "prefix",
  Regex = "regex",
}

export type FilterPageListBy = {
  urlPrefix?: string;
  urlRegex?: string;
};

enum FormFieldName {
  Type = "filterType",
  Value = "filterValue",
}

const placeholderFor = {
  [FilterType.Prefix]: msg("Enter beginning of URL"),
  [FilterType.Regex]: msg("Enter regular expression pattern"),
} as const;

const handleTypeChange = (e: SlChangeEvent) => {
  const el = e.target as SlRadioGroup;
  const formEl = el.closest("form");
  const inputEl = formEl?.querySelector<HTMLInputElement>(
    `[name="${FormFieldName.Value}"]`,
  );
  const value = el.value as FilterType;

  if (!inputEl) {
    console.debug(`no input with [name="${FormFieldName.Value}"]`);
    return;
  }

  inputEl.setAttribute("placeholder", placeholderFor[value]);

  if (inputEl.value) {
    inputEl.value =
      value === FilterType.Prefix
        ? regexUnescape(inputEl.value)
        : regexEscape(inputEl.value);
  }
};

const handleValueChange = (e: SlChangeEvent) => {
  const el = e.target as SlInput;
  const formEl = el.closest("form");
  const radioEl = formEl?.querySelector<HTMLInputElement>(
    `[name="${FormFieldName.Type}"]`,
  );
  const value = el.value.trim();

  el.setCustomValidity("");

  if ((radioEl?.value as FilterType) === FilterType.Regex) {
    try {
      // Check if valid regex
      new RegExp(value);
    } catch {
      el.setCustomValidity(
        msg("Please enter a valid regular expression pattern."),
      );
    }
  }
};

const closeDropdown = (e: Event) => {
  const filterEl = (e.target as HTMLElement).closest<FilterChip>(
    "btrix-filter-chip",
  );

  if (!filterEl) {
    console.debug("no `btrix-filter-chip` to close");
    return;
  }

  filterEl.hideDropdown();
};

const handleReset = (e: Event) => {
  closeDropdown(e);
};

const submitHandler =
  (filterBy: SearchParamsValue<FilterPageListBy>) => (e: SubmitEvent) => {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    const values = serialize(formEl) as Record<FormFieldName, string>;

    if (formEl.checkValidity()) {
      const urlPrefix = (values.filterType as FilterType) === FilterType.Prefix;
      const value = values.filterValue.trim();

      if (value) {
        filterBy.setValue(
          urlPrefix
            ? {
                urlPrefix: value,
              }
            : { urlRegex: value },
        );
      } else {
        filterBy.setValue({});
      }

      closeDropdown(e);
    }
  };

export function pageListFilterControl(
  filterBy: SearchParamsValue<FilterPageListBy>,
) {
  const urlPrefix = filterBy.value.urlPrefix;
  const urlRegex = filterBy.value.urlRegex;
  const active = Boolean(urlPrefix || urlRegex);
  const filterType = urlRegex ? FilterType.Regex : FilterType.Prefix;
  const regex_pattern = html`<code class="font-medium">${urlRegex}</code>`;
  const url_prefix = html`<span class="font-medium">${urlPrefix}</span>`;

  return html`<div class="flex items-center gap-4 overflow-hidden">
    <div class="flex gap-2 items-center whitespace-nowrap overflow-hidden">
      ${msg("Filter by:")}
      <btrix-filter-chip
        class="overflow-hidden inline-block part-[dropdown]:max-w-full part-[button]:max-w-full"
        selectFromDropdown
        ?checked=${active}
      >
        ${urlRegex
          ? html`<span class="font-normal"
              >${msg(html`URL matches ${regex_pattern}`)}</span
            >`
          : urlPrefix
            ? html`<span class="font-normal"
                >${msg(html`URL begins with ${url_prefix}`)}</span
              >`
            : msg("URL")}

        <div slot="dropdown-content" class="border rounded shadow-lg bg-white">
          <div class="flex flex-wrap justify-between items-center p-1">
            <div class="text-neutral-500 font-medium leading-8 px-2">
              ${msg("Filter by URL")}
            </div>
            ${when(
              active,
              () =>
                html`<sl-tooltip content=${msg("Clear")}>
                  <sl-icon-button
                    class="text-base"
                    name="x-lg"
                    library="system"
                    @click=${(e: Event) => {
                      filterBy.setValue({});
                      closeDropdown(e);
                    }}
                  ></sl-icon-button>
                </sl-tooltip>`,
            )}
          </div>
          <form @reset=${handleReset} @submit=${submitHandler(filterBy)}>
            <div class="px-3 pb-3 border-b">
              <sl-radio-group
                name=${FormFieldName.Type}
                class="mb-3 part-[form-control-label]:sr-only"
                label=${msg("Filter type")}
                size="small"
                value=${filterType}
                @sl-change=${handleTypeChange}
              >
                <sl-radio-button value=${FilterType.Prefix}
                  >${msg("Begins With")}</sl-radio-button
                >
                <sl-radio-button value=${FilterType.Regex}
                  >${msg("Matches Pattern")}</sl-radio-button
                >
              </sl-radio-group>
              <sl-input
                name=${FormFieldName.Value}
                class="part-[form-control-label]:sr-only min-w-[40ch]"
                label=${msg("Filter value")}
                size="small"
                placeholder=${placeholderFor[filterType]}
                .minlength=${2}
                .maxlength=${500}
                value=${(urlRegex
                  ? filterBy.value.urlRegex
                  : filterBy.value.urlPrefix) ?? ""}
                @sl-change=${handleValueChange}
              ></sl-input>
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
