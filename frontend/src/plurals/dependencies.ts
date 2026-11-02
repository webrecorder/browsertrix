import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";
import { cached } from "@/utils/weakCache";

export const pluralOfDependencies = cached((number: number) => {
  const count = localize.number(number, { notation: "compact" });
  return pluralize(number, {
    zero: msg("0 dependencies", {
      desc: "plural form of 'X dependencies' for zero dependencies",
      id: "x_dependencies.plural.zero",
    }),
    one: msg("1 dependency", {
      desc: "plural form of 'X dependencies' for one dependency",
      id: "x_dependencies.plural.one",
    }),
    two: msg("2 dependencies", {
      desc: "plural form of 'X dependencies' for two dependencies",
      id: "x_dependencies.plural.two",
    }),
    few: msg(str`${count} dependencies`, {
      desc: "plural form of 'X dependencies' for few dependencies",
      id: "x_dependencies.plural.few",
    }),
    many: msg(str`${count} dependencies`, {
      desc: "plural form of 'X dependencies' for many dependencies",
      id: "x_dependencies.plural.many",
    }),
    other: msg(str`${count} dependencies`, {
      desc: "plural form of 'X dependencies' for other dependencies",
      id: "x_dependencies.plural.other",
    }),
  });
});
