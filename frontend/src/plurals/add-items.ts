import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfAddItems = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("Add 0 items", {
      desc: "plural form of 'Add X items' for zero items",
      id: "add_x_items.plural.zero",
    }),
    one: msg("Add 1 item", {
      desc: "plural form of 'Add X items' for one item",
      id: "add_x_items.plural.one",
    }),
    two: msg("Add 2 items", {
      desc: "plural form of 'Add X items' for two items",
      id: "add_x_items.plural.two",
    }),
    few: msg(str`Add ${count} items`, {
      desc: "plural form of 'Add X items' for few items",
      id: "add_x_items.plural.few",
    }),
    many: msg(str`Add ${count} items`, {
      desc: "plural form of 'Add X items' for many items",
      id: "add_x_items.plural.many",
    }),
    other: msg(str`Add ${count} items`, {
      desc: "plural form of 'Add X items' for other items",
      id: "add_x_items.plural.other",
    }),
  });
};
