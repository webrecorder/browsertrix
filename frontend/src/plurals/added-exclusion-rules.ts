import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfAddedExclusionRules = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("Added 0 rules", {
      desc: "plural form of 'Added X rules' for zero exclusion rules",
      id: "added_exclusion_rules.plural.zero",
    }),
    one: msg("Added 1 rule", {
      desc: "plural form of 'Added X rules' for one exclusion rule",
      id: "added_exclusion_rules.plural.one",
    }),
    two: msg("Added 2 rules", {
      desc: "plural form of 'Added X rules' for two exclusion rules",
      id: "added_exclusion_rules.plural.two",
    }),
    few: msg(str`Added ${count} rules`, {
      desc: "plural form of 'Added X rules' for few exclusion rules",
      id: "added_exclusion_rules.plural.few",
    }),
    many: msg(str`Added ${count} rules`, {
      desc: "plural form of 'Added X rules' for many exclusion rules",
      id: "added_exclusion_rules.plural.many",
    }),
    other: msg(str`Added ${count} rules`, {
      desc: "plural form of 'Added X rules' for other exclusion rules",
      id: "added_exclusion_rules.plural.other",
    }),
  });
};
