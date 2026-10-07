import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfItems = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("0 items", {
      desc: "plural form of 'X items' for zero items",
      id: "items_with_num.plural.zero",
    }),
    one: msg("1 item", {
      desc: "plural form of 'X items' for one rule",
      id: "items_with_num.plural.one",
    }),
    two: msg("2 items", {
      desc: "plural form of 'X items' for two items",
      id: "items_with_num.plural.two",
    }),
    few: msg(str`${count} items`, {
      desc: "plural form of 'X items' for few items",
      id: "items_with_num.plural.few",
    }),
    many: msg(str`${count} items`, {
      desc: "plural form of 'X items' for many items",
      id: "items_with_num.plural.many",
    }),
    other: msg(str`${count} items`, {
      desc: "plural form of 'X items' for other items",
      id: "items_with_num.plural.other",
    }),
  });
};
