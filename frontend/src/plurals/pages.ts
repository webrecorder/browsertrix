import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfPages = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("0 pages", {
      desc: "plural form of 'X pages' for zero pages",
      id: "pages_with_num.plural.zero",
    }),
    one: msg("1 page", {
      desc: "plural form of 'X pages' for one rule",
      id: "pages_with_num.plural.one",
    }),
    two: msg("2 pages", {
      desc: "plural form of 'X pages' for two pages",
      id: "pages_with_num.plural.two",
    }),
    few: msg(str`${count} pages`, {
      desc: "plural form of 'X pages' for few pages",
      id: "pages_with_num.plural.few",
    }),
    many: msg(str`${count} pages`, {
      desc: "plural form of 'X pages' for many pages",
      id: "pages_with_num.plural.many",
    }),
    other: msg(str`${count} pages`, {
      desc: "plural form of 'X pages' for other pages",
      id: "pages_with_num.plural.other",
    }),
  });
};
