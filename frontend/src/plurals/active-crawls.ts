import { msg, str } from "@lit/localize";

import localize from "@/utils/localize";
import { pluralize } from "@/utils/pluralize";

export const pluralOfActiveCrawls = (number: number) => {
  const count = localize.number(number, { notation: "compact" });
  return pluralize(number, {
    zero: msg("0 Active Crawls", {
      desc: "plural form of 'X Active Crawls' for zero active crawls",
      id: "active_crawls.plural.zero",
    }),
    one: msg("1 Active Crawl", {
      desc: "plural form of 'X Active Crawls' for one active crawl",
      id: "active_crawls.plural.one",
    }),
    two: msg("2 Active Crawls", {
      desc: "plural form of 'X Active Crawls' for two active crawls",
      id: "active_crawls.plural.two",
    }),
    few: msg(str`${count} Active Crawls`, {
      desc: "plural form of 'X Active Crawls' for few active crawls",
      id: "active_crawls.plural.few",
    }),
    many: msg(str`${count} Active Crawls`, {
      desc: "plural form of 'X Active Crawls' for many active crawls",
      id: "active_crawls.plural.many",
    }),
    other: msg(str`${count} Active Crawls`, {
      desc: "plural form of 'X Active Crawls' for other active crawls",
      id: "active_crawls.plural.other",
    }),
  });
};
