import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfRemovedExclusionRules = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("Removed 0 rules", {
      desc: "plural form of 'Removed X rules' for zero exclusion rules",
      id: "removed_exclusion_rules.plural.zero",
    }),
    one: msg("Removed 1 rule", {
      desc: "plural form of 'Removed X rules' for one exclusion rule",
      id: "removed_exclusion_rules.plural.one",
    }),
    two: msg("Removed 2 rules", {
      desc: "plural form of 'Removed X rules' for two exclusion rules",
      id: "removed_exclusion_rules.plural.two",
    }),
    few: msg(str`Removed ${count} rules`, {
      desc: "plural form of 'Removed X rules' for few exclusion rules",
      id: "removed_exclusion_rules.plural.few",
    }),
    many: msg(str`Removed ${count} rules`, {
      desc: "plural form of 'Removed X rules' for many exclusion rules",
      id: "removed_exclusion_rules.plural.many",
    }),
    other: msg(str`Removed ${count} rules`, {
      desc: "plural form of 'Removed X rules' for other exclusion rules",
      id: "removed_exclusion_rules.plural.other",
    }),
  });
};
