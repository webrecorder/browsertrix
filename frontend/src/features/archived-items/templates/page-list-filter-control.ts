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
  Text = "text",
  Regex = "regex",
}

export type FilterPageListBy = {
  urlRegex?: string;
};

enum FormFieldName {
  Type = "filterType",
  Value = "filterValue",
}

const placeholderFor = {
  [FilterType.Text]: msg("Enter text to match"),
  [FilterType.Regex]: msg("Enter regular expression pattern"),
} as const;

function isTextType(urlRegex?: string) {
  if (!urlRegex) return;
  return regexEscape(regexUnescape(urlRegex)) === urlRegex;
}

const closeDropdownHandler =
  ({ resetOnClose } = { resetOnClose: false }) =>
  (e: Event) => {
    const filterChipEl = (e.target as HTMLElement).closest<FilterChip>(
      "btrix-filter-chip",
    );

    if (!filterChipEl) {
      console.debug("no `btrix-filter-chip` to close");
      return;
    }

    if (!resetOnClose) {
      // Stop sl-after-hide to prevent form reset
      filterChipEl.addEventListener(
        "sl-after-hide",
        (e) => {
          e.stopImmediatePropagation();
        },
        { once: true, capture: true },
      );
    }

    filterChipEl.hideDropdown();
  };

const closeAndReset = closeDropdownHandler({ resetOnClose: true });
const close = closeDropdownHandler();

const submitHandler =
  (filterBy: SearchParamsValue<FilterPageListBy>) => (e: SubmitEvent) => {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    const values = serialize(formEl) as Record<FormFieldName, string>;

    if (formEl.checkValidity()) {
      const value = values.filterValue.trim();

      if (value) {
        filterBy.setValue({
          ...filterBy.value,
          urlRegex:
            (values.filterType as FilterType) === FilterType.Text
              ? regexEscape(value)
              : value,
        });
      } else {
        filterBy.setValue({ ...filterBy.value, urlRegex: undefined });
      }

      close(e);
    }
  };

const afterHideHandler =
  (filterBy: SearchParamsValue<FilterPageListBy>) => (e: CustomEvent) => {
    const formEl = (e.currentTarget as HTMLElement).querySelector("form");
    const typeInputEl = formEl?.querySelector<HTMLInputElement>(
      `[name="${FormFieldName.Type}"]`,
    );
    const valueInputEl = formEl?.querySelector<HTMLInputElement>(
      `[name="${FormFieldName.Value}"]`,
    );

    const urlRegex = filterBy.value.urlRegex;
    const textType = isTextType(urlRegex);
    const filterType =
      textType || !urlRegex ? FilterType.Text : FilterType.Regex;

    // Reset to saved value
    typeInputEl?.setAttribute("value", filterType);
    valueInputEl?.setAttribute(
      "value",
      urlRegex ? (textType ? regexUnescape(urlRegex) : urlRegex) : "",
    );
  };

const handleTypeChange = (e: SlChangeEvent) => {
  const el = e.target as SlRadioGroup;
  const formEl = el.closest("form");
  const valueInputEl = formEl?.querySelector<HTMLInputElement>(
    `[name="${FormFieldName.Value}"]`,
  );
  const value = el.value as FilterType;

  if (!valueInputEl) {
    console.debug(`no input with [name="${FormFieldName.Value}"]`);
    return;
  }

  valueInputEl.setAttribute("placeholder", placeholderFor[value]);

  const inputValue = valueInputEl.value;

  if (inputValue) {
    valueInputEl.value =
      value === FilterType.Text
        ? regexUnescape(inputValue)
        : regexEscape(regexUnescape(inputValue));
  }
};

const handleValueChange = (e: SlChangeEvent) => {
  const el = e.target as SlInput;
  const formEl = el.closest("form");
  const typeInputEl = formEl?.querySelector<HTMLInputElement>(
    `[name="${FormFieldName.Type}"]`,
  );
  const value = el.value.trim();

  el.setCustomValidity("");

  if ((typeInputEl?.value as FilterType) === FilterType.Regex) {
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

export function pageListFilterControl(
  filterBy: SearchParamsValue<FilterPageListBy>,
) {
  const urlRegex = filterBy.value.urlRegex;
  const textType = isTextType(urlRegex);
  const urlText = regexUnescape(urlRegex);
  const active = Boolean(urlRegex);
  const filterType = textType || !urlRegex ? FilterType.Text : FilterType.Regex;
  const inputValue = (textType ? urlText : urlRegex) || "";
  const pattern = textType
    ? html`<span class="font-medium">${urlText}</span>`
    : html`<btrix-regex
        class="font-medium"
        value=${urlRegex || ""}
      ></btrix-regex>`;

  return html`<div class="flex items-center gap-4 overflow-hidden">
    <div class="flex gap-2 items-center whitespace-nowrap overflow-hidden">
      ${msg("Filter by:")}
      <btrix-filter-chip
        class="overflow-hidden inline-block part-[dropdown]:max-w-full part-[button]:max-w-full"
        selectFromDropdown
        ?checked=${active}
        @sl-after-hide=${afterHideHandler(filterBy)}
      >
        ${urlRegex
          ? html`<span class="font-normal"
              >${msg(html`URL matches ${pattern}`)}</span
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
                html`<sl-tooltip content=${msg("Remove Filter")}>
                  <sl-icon-button
                    class="text-base"
                    name="trash3"
                    @click=${(e: Event) => {
                      filterBy.setValue({
                        ...filterBy.value,
                        urlRegex: undefined,
                      });
                      close(e);
                    }}
                  ></sl-icon-button>
                </sl-tooltip>`,
            )}
          </div>
          <form @submit=${submitHandler(filterBy)}>
            <div class="px-3 pb-3 border-b">
              <sl-radio-group
                name=${FormFieldName.Type}
                class="mb-2 part-[form-control-label]:sr-only"
                label=${msg("Filter type")}
                size="small"
                value=${filterType}
                @sl-change=${handleTypeChange}
              >
                <sl-radio-button value=${FilterType.Text}
                  >${msg("Matches Text")}</sl-radio-button
                >
                <sl-radio-button value=${FilterType.Regex}
                  >${msg("Regex")}</sl-radio-button
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
                value=${inputValue}
                @sl-change=${handleValueChange}
              ></sl-input>
            </div>

            <div class="flex justify-between gap-2 flex-wrap px-3 py-2">
              <sl-button
                class="part-[label]:px-0"
                variant="text"
                size="small"
                @click=${closeAndReset}
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
