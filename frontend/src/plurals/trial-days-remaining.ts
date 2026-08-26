import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfTrialDaysRemaining = (number: number) => {
  const count = localize.number(number);
  return pluralize(number, {
    zero: msg("0 days left of trial", {
      desc: "plural form of 'X days left of trial' for zero trial days remaining",
      id: "trial_days_remaining.plural.zero",
    }),
    one: msg("1 day left of trial", {
      desc: "plural form of 'X days left of trial' for one active crawl",
      id: "trial_days_remaining.plural.one",
    }),
    two: msg("2 days left of trial", {
      desc: "plural form of 'X days left of trial' for two trial days remaining",
      id: "trial_days_remaining.plural.two",
    }),
    few: msg(str`${count} days left of trial`, {
      desc: "plural form of 'X days left of trial' for few trial days remaining",
      id: "trial_days_remaining.plural.few",
    }),
    many: msg(str`${count} days left of trial`, {
      desc: "plural form of 'X days left of trial' for many trial days remaining",
      id: "trial_days_remaining.plural.many",
    }),
    other: msg(str`${count} days left of trial`, {
      desc: "plural form of 'X days left of trial' for other trial days remaining",
      id: "trial_days_remaining.plural.other",
    }),
  });
};
