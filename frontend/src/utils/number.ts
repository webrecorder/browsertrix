import { msg } from "@lit/localize";

/**
 * Create internationalized number formatter
 *
 * You probably want to use `localize.number()` from `/utils/localize`
 * directly instead of creating a new number formatter.
 *
 * Usage:
 * ```ts
 * const formatter = numberFormatter()
 * formatter.format(10000); // 10,000
 * formatter.format(10, { ordinal: true }); // 10th
 * ```
 **/
export function numberFormatter(
  locales?: string | string[],
  opts?: Intl.NumberFormatOptions,
) {
  const numFormat = new Intl.NumberFormat(locales, opts);
  const pluralRules = new Intl.PluralRules(locales, { type: "ordinal" });

  const suffixes: Record<Intl.LDMLPluralRule, string> = {
    zero: msg("th", {
      desc: 'Ordinal suffix for "zero", e.g. 0th (the "th" part)',
      id: "ordinal-suffix-zero",
    }),
    one: msg("st", {
      desc: 'Ordinal suffix for "one", e.g. 1st (the "st" part)',
      id: "ordinal-suffix-one",
    }),
    two: msg("nd", {
      desc: 'Ordinal suffix for "two", e.g. 2nd (the "nd" part)',
      id: "ordinal-suffix-two",
    }),
    few: msg("rd", {
      desc: 'Ordinal suffix for "few", e.g. 3rd (the "rd" part)',
      id: "ordinal-suffix-few",
    }),
    other: msg("th", {
      desc: 'Ordinal suffix for "other", e.g. 4th (the "th" part)',
      id: "ordinal-suffix-other",
    }),
    many: msg("th", {
      desc: 'Ordinal suffix for "many" (not used in English, but for example in Gujarati, the "ઠો" part of 6ઠો)',
      id: "ordinal-suffix-many",
    }),
  };

  const format = (n: number, opts: { ordinal?: boolean } = {}) => {
    if (opts.ordinal) {
      const rule = pluralRules.select(n);
      const suffix = suffixes[rule];
      return `${numFormat.format(n)}${suffix}`;
    }

    return numFormat.format(n);
  };

  return { format };
}
