import { sourceLocale } from "@/__generated__/locale-codes";
import type { LanguageCode } from "@/types/localization";
import appState from "@/utils/state";

export const LOCALE_PARAM_NAME = "locale" as const;

export const getLocale = () => {
  return appState.userLanguage || getLang() || sourceLocale;
};

/**
 * Get time zone short name from locales
 * @param locales List of locale codes. Omit for browser default
 **/
export const getLocaleTimeZone = (locales?: string[]) => {
  const date = new Date();

  return date
    .toLocaleTimeString(locales || [], {
      timeZoneName: "short",
      hour: "2-digit",
    })
    .replace(date.toLocaleTimeString([], { hour: "2-digit" }), "")
    .trim();
};

export const pluralize = (
  number: number,
  strings: { [k in Intl.LDMLPluralRule]: string },
  options?: Intl.PluralRulesOptions,
) => strings[new Intl.PluralRules(getLocale(), options).select(number)];

export const formatNumber = (
  number: number,
  options?: Intl.NumberFormatOptions,
) => new Intl.NumberFormat(getLocale(), options).format(number);

export const formatISODateString = (
  date: string, // ISO string
  options?: Intl.DateTimeFormatOptions,
) =>
  new Date(date.endsWith("Z") ? date : `${date}Z`).toLocaleDateString(
    getLocale(),
    {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    },
  );

export function langShortCode(locale: string) {
  return locale.split("-")[0] as LanguageCode;
}

export function getLang() {
  // Default to current user browser language
  const browserLanguage = window.navigator.language;
  if (browserLanguage) {
    return langShortCode(browserLanguage);
  }
  return null;
}
