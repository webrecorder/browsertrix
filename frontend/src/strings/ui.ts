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

  // This is necessary because we need to wrap the item name + the question mark
  // in a span element for correct layout, which makes translating it tricky.
  // This simplifies the markup in the translated template, while hopefully still
  // allowing for enough variation in e.g. punctuation placement when translating.
  const wrapItemName = (strings: TemplateStringsArray, ...items: unknown[]) =>
    html`<span class="inline-flex max-w-full"
      >${html(strings, ...items)}</span
    >`;

  return msg(html`
    Are you sure you want to delete ${wrapItemName`${itemName}?`}
  `);
};
