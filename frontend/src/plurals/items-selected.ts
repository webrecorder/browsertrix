import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfItemsSelected = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("0 items selected", {
      desc: "plural form of 'X items selected' for zero items selected",
      id: "items_selected.plural.zero",
    }),
    one: msg("1 item selected", {
      desc: "plural form of 'X items selected' for one rule",
      id: "items_selected.plural.one",
    }),
    two: msg("2 items selected", {
      desc: "plural form of 'X items selected' for two items selected",
      id: "items_selected.plural.two",
    }),
    few: msg(str`${count} items selected`, {
      desc: "plural form of 'X items selected' for few items selected",
      id: "items_selected.plural.few",
    }),
    many: msg(str`${count} items selected`, {
      desc: "plural form of 'X items selected' for many items selected",
      id: "items_selected.plural.many",
    }),
    other: msg(str`${count} items selected`, {
      desc: "plural form of 'X items selected' for other items selected",
      id: "items_selected.plural.other",
    }),
  });
};
