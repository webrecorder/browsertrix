import { configureLocalization } from "@lit/localize";

import appState, { AppStateService } from "./state";

import {
  allLocales,
  sourceLocale,
  targetLocales,
} from "@/__generated__/locale-codes";
import { type LocaleCodeEnum } from "@/types/localization";

const LOCALE_PARAM_NAME = "locale" as const;

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: string) =>
    import(`/src/__generated__/locales/${locale}.ts`),
});
export { getLocale };

export const updateUrlLocale = async (locale: LocaleCodeEnum) => {
  const url = new URL(window.location.href);
  url.searchParams.set(LOCALE_PARAM_NAME, locale);
  window.history.pushState(null, "", url.toString());

  await setLocale(locale);
};

export const getLocaleFromUrl = () => {
  const url = new URL(window.location.href);
  const locale = url.searchParams.get(LOCALE_PARAM_NAME);

  if (allLocales.includes(locale as unknown as LocaleCodeEnum)) {
    return locale as LocaleCodeEnum;
  }
};

export const setLocaleFromUrl = async () => {
  const locale = getLocaleFromUrl();

  if (!locale) return;

  await setLocale(locale);
};

export const updateAppStateLocale = async (locale: LocaleCodeEnum) => {
  AppStateService.partialUpdateUserPreferences({ locale });

  await setLocale(locale);
};

export const setLocaleFromAppState = async () => {
  const locale = appState.userPreferences?.locale;

  if (!locale) return;

  await setLocale(locale);
};

export const resetLocale = async () => {
  await setLocale(sourceLocale);
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

export function getLang() {
  // Default to current user browser language
  const browserLanguage = window.navigator.language;
  if (browserLanguage) {
    return browserLanguage.slice(0, browserLanguage.indexOf("-"));
  }
  return null;
}
