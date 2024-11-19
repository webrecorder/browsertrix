/**
 * Manage translations and language-specific formatting throughout app
 */
import { configureLocalization } from "@lit/localize";
import uniq from "lodash/fp/uniq";

import { sourceLocale, targetLocales } from "@/__generated__/locale-codes";
import {
  languageCodeSchema,
  translatedLocales,
  type AllLanguageCodes,
  type LanguageCode,
} from "@/types/localization";
import { numberFormatter } from "@/utils/number";
import appState from "@/utils/state";

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: string) =>
    import(`/src/__generated__/locales/${locale}.ts`),
});

const defaultNumberFormatter = numberFormatter(sourceLocale);

export class Localize {
  private readonly numberFormatters = new Map([
    [sourceLocale, defaultNumberFormatter],
  ]);

  get activeLanguage() {
    return (document.documentElement.lang as LanguageCode) || sourceLocale;
  }
  private set activeLanguage(lang: LanguageCode) {
    // Setting the `lang` attribute will automatically localize all Shoelace elements
    document.documentElement.lang = lang;
  }

  get languages() {
    return uniq([
      ...translatedLocales,
      ...window.navigator.languages.map(langShortCode),
    ]);
  }

  constructor(initialLanguage: LanguageCode = sourceLocale) {
    this.activeLanguage = initialLanguage;
  }

  initLanguage() {
    this.setLanguage(
      appState.userPreferences?.language || getBrowserLang() || sourceLocale,
    );
  }

  /**
   * User-initiated language setting
   */
  setLanguage(lang: LanguageCode) {
    const { error } = languageCodeSchema.safeParse(lang);

    if (error) {
      console.debug("Error setting language:", error);
      return;
    }

    this.numberFormatters.set(lang, numberFormatter(lang));

    this.activeLanguage = lang;

    this.setTranslation(lang);
  }

  number(...args: Parameters<(typeof defaultNumberFormatter)["format"]>) {
    return (
      this.numberFormatters.get(this.activeLanguage) || defaultNumberFormatter
    ).format(...args);
  }

  private setTranslation(lang: LanguageCode) {
    if (
      lang !== getLocale() &&
      (translatedLocales as AllLanguageCodes).includes(lang)
    ) {
      void setLocale(lang);
    }
  }
}

const localize = new Localize(sourceLocale);

export default localize;

export const formatNumber = (
  number: number,
  options?: Intl.NumberFormatOptions,
) => new Intl.NumberFormat(localize.activeLanguage, options).format(number);

export const formatISODateString = (
  date: string, // ISO string
  options?: Intl.DateTimeFormatOptions,
) =>
  new Date(date.endsWith("Z") ? date : `${date}Z`).toLocaleDateString(
    localize.activeLanguage,
    {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...options,
    },
  );

function langShortCode(locale: string) {
  return locale.split("-")[0] as LanguageCode;
}

export function getBrowserLang() {
  // Default to current user browser language
  const browserLanguage = window.navigator.language;
  if (browserLanguage) {
    return langShortCode(browserLanguage);
  }
  return null;
}
