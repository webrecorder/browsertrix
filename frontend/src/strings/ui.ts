import { msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";

export const stringFor: Record<string, string> = {
  noData: "--",
  notApplicable: msg("n/a"),
  notSpecified: msg("Not specified"),
  none: msg("None"),
};

export const noData = stringFor.noData;
export const notApplicable = stringFor.notApplicable;

// TODO Refactor all generic confirmation messages to use utility
export const deleteConfirmation = (name: string | TemplateResult) => {
  const itemName = html`<strong class="inline-flex max-w-full font-semibold"
    >${name}</strong
  >`;

  return html`<span class="*:inline-flex *:max-w-full"
    >${msg(
      html`Are you sure you want to delete <span>${itemName}?</span>`,
    )}</span
  >`;
};
