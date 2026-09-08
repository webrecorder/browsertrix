import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfSkippingItems = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("Skipping 0 items", {
      desc: "plural form of 'Skipping X items' for zero items",
      id: "skipping_items.plural.zero",
    }),
    one: msg("Skipping 1 item", {
      desc: "plural form of 'Skipping X items' for one item",
      id: "skipping_items.plural.one",
    }),
    two: msg("Skipping 2 items", {
      desc: "plural form of 'Skipping X items' for two items",
      id: "skipping_items.plural.two",
    }),
    few: msg(str`Skipping ${count} items`, {
      desc: "plural form of 'Skipping X items' for few items",
      id: "skipping_items.plural.few",
    }),
    many: msg(str`Skipping ${count} items`, {
      desc: "plural form of 'Skipping X items' for many items",
      id: "skipping_items.plural.many",
    }),
    other: msg(str`Skipping ${count} items`, {
      desc: "plural form of 'Skipping X items' for other items",
      id: "skipping_items.plural.other",
    }),
  });
};
