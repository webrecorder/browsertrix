import { msg } from "@lit/localize";

import localize from "./localize";

export const pluralize = (
  number: number,
  strings: { [k in Intl.LDMLPluralRule]: string },
  options?: Intl.PluralRulesOptions,
) =>
  strings[
    new Intl.PluralRules(localize.activeLanguage, options).select(number)
  ];

// Add to this as necessary!
const plurals = {
  crawls: {
    zero: msg("crawls", {
      desc: 'plural form of "crawl" for zero crawls',
      id: "crawls.plural.zero",
    }),
    one: msg("crawl", {
      desc: 'singular form for "crawl"',
      id: "crawls.plural.one",
    }),
    two: msg("crawls", {
      desc: 'plural form of "crawl" for two crawls',
      id: "crawls.plural.two",
    }),
    few: msg("crawls", {
      desc: 'plural form of "crawl" for few crawls',
      id: "crawls.plural.few",
    }),
    many: msg("crawls", {
      desc: 'plural form of "crawl" for many crawls',
      id: "crawls.plural.many",
    }),
    other: msg("crawls", {
      desc: 'plural form of "crawl" for multiple/other crawls',
      id: "crawls.plural.other",
    }),
  },
  items: {
    zero: msg("items", {
      desc: 'plural form of "item" for zero items',
      id: "items.plural.zero",
    }),
    one: msg("item", {
      desc: 'singular form for "item"',
      id: "items.plural.one",
    }),
    two: msg("items", {
      desc: 'plural form of "item" for two items',
      id: "items.plural.two",
    }),
    few: msg("items", {
      desc: 'plural form of "item" for few items',
      id: "items.plural.few",
    }),
    many: msg("items", {
      desc: 'plural form of "item" for many items',
      id: "items.plural.many",
    }),
    other: msg("items", {
      desc: 'plural form of "item" for multiple/other items',
      id: "items.plural.other",
    }),
  },
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
  URLs: {
    zero: msg("URLs", {
      desc: 'plural form of "URLs" for zero URLs',
      id: "URLs.plural.zero",
    }),
    one: msg("URL", {
      desc: 'singular form for "URL"',
      id: "URLs.plural.one",
    }),
    two: msg("URLs", {
      desc: 'plural form of "URLs" for two URLs',
      id: "URLs.plural.two",
    }),
    few: msg("URLs", {
      desc: 'plural form of "URLs" for few URLs',
      id: "URLs.plural.few",
    }),
    many: msg("URLs", {
      desc: 'plural form of "URLs" for many URLs',
      id: "URLs.plural.many",
    }),
    other: msg("URLs", {
      desc: 'plural form of "URLs" for multiple/other URLs',
      id: "URLs.plural.other",
    }),
  },
  rows: {
    zero: msg("rows", {
      desc: 'plural form of "rows" for zero rows',
      id: "rows.plural.zero",
    }),
    one: msg("row", {
      desc: 'singular form for "row"',
      id: "rows.plural.one",
    }),
    two: msg("rows", {
      desc: 'plural form of "rows" for two rows',
      id: "rows.plural.two",
    }),
    few: msg("rows", {
      desc: 'plural form of "rows" for few rows',
      id: "rows.plural.few",
    }),
    many: msg("rows", {
      desc: 'plural form of "rows" for many rows',
      id: "rows.plural.many",
    }),
    other: msg("rows", {
      desc: 'plural form of "rows" for multiple/other rows',
      id: "rows.plural.other",
    }),
  },
  errors: {
    zero: msg("errors", {
      desc: 'plural form of "errors" for zero errors',
      id: "errors.plural.zero",
    }),
    one: msg("error", {
      desc: 'singular form for "error"',
      id: "errors.plural.one",
    }),
    two: msg("errors", {
      desc: 'plural form of "errors" for two errors',
      id: "errors.plural.two",
    }),
    few: msg("errors", {
      desc: 'plural form of "errors" for few errors',
      id: "errors.plural.few",
    }),
    many: msg("errors", {
      desc: 'plural form of "errors" for many errors',
      id: "errors.plural.many",
    }),
    other: msg("errors", {
      desc: 'plural form of "errors" for multiple/other errors',
      id: "errors.plural.other",
    }),
  },
  browserWindows: {
    zero: msg("browser windows", {
      desc: 'plural form of "browser windows" for zero browser windows',
      id: "browserWindows.plural.zero",
    }),
    one: msg("browser window", {
      desc: 'singular form for "browser window"',
      id: "browserWindows.plural.one",
    }),
    two: msg("browser windows", {
      desc: 'plural form of "browser windows" for two browser windows',
      id: "browserWindows.plural.two",
    }),
    few: msg("browser windows", {
      desc: 'plural form of "browser windows" for few browser windows',
      id: "browserWindows.plural.few",
    }),
    many: msg("browser windows", {
      desc: 'plural form of "browser windows" for many browser windows',
      id: "browserWindows.plural.many",
    }),
    other: msg("browser windows", {
      desc: 'plural form of "browser windows" for multiple/other browser windows',
      id: "browserWindows.plural.other",
    }),
  },
  profiles: {
    zero: msg("profiles", {
      desc: 'plural form of "profiles" for zero profiles',
      id: "profiles.plural.zero",
    }),
    one: msg("profile", {
      desc: 'singular form for "profile"',
      id: "profiles.plural.one",
    }),
    two: msg("profiles", {
      desc: 'plural form of "profiles" for two profiles',
      id: "profiles.plural.two",
    }),
    few: msg("profiles", {
      desc: 'plural form of "profiles" for few profiles',
      id: "profiles.plural.few",
    }),
    many: msg("profiles", {
      desc: 'plural form of "profiles" for many profiles',
      id: "profiles.plural.many",
    }),
    other: msg("profiles", {
      desc: 'plural form of "profiles" for multiple/other profiles',
      id: "profiles.plural.other",
    }),
  },
};

export const pluralOf = (word: keyof typeof plurals, count: number) => {
  return pluralize(count, plurals[word]);
};
