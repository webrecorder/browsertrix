import { msg } from "@lit/localize";

import { pluralize } from "./localization";

// Add to this as necessary!
const plurals = {
  pages: {
    zero: msg("pages", {
      desc: 'plural form of "page" for zero pages',
      id: "pages.plural.zero",
    }),
    one: msg("page", {
      desc: 'singular form for "page"',
      id: "pages.plural.one",
    }),
    two: msg("pages", {
      desc: 'plural form of "page" for two pages',
      id: "pages.plural.two",
    }),
    few: msg("pages", {
      desc: 'plural form of "page" for few pages',
      id: "pages.plural.few",
    }),
    many: msg("pages", {
      desc: 'plural form of "page" for many pages',
      id: "pages.plural.many",
    }),
    other: msg("pages", {
      desc: 'plural form of "page" for multiple/other pages',
      id: "pages.plural.other",
    }),
  },
  comments: {
    zero: msg("comments", {
      desc: 'plural form of "comment" for zero comments',
      id: "comments.plural.zero",
    }),
    one: msg("comment", {
      desc: 'singular form for "comment"',
      id: "comments.plural.one",
    }),
    two: msg("comments", {
      desc: 'plural form of "comment" for two comments',
      id: "comments.plural.two",
    }),
    few: msg("comments", {
      desc: 'plural form of "comment" for few comments',
      id: "comments.plural.few",
    }),
    many: msg("comments", {
      desc: 'plural form of "comment" for many comments',
      id: "comments.plural.many",
    }),
    other: msg("comments", {
      desc: 'plural form of "comment" for multiple/other comments',
      id: "comments.plural.other",
    }),
  },
};

export const pluralOf = (word: keyof typeof plurals, count: number) => {
  return pluralize(count, plurals[word]);
};
