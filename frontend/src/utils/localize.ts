/**
 * Manage translations and language-specific formatting throughout app
 *
 * @FIXME The Intl.DurationFormat polyfill is currently shimmed with webpack.ProvidePlugin
 * to avoid encoding issues when importing the polyfill asynchronously in the test server.
 * See https://github.com/web-dev-server/web-dev-server/issues/1
 */
import { match } from "@formatjs/intl-localematcher";
import { configureLocalization } from "@lit/localize";
import uniq from "lodash/uniq";

import { cached } from "./weakCache";

import { sourceLocale, targetLocales } from "@/__generated__/locale-codes";
import {
  languageCodeSchema,
  translatedLocales,
  type AllLanguageCodes,
  type LanguageCode,
} from "@/types/localization";
import appState from "@/utils/state";

// Pre-load all locales
const localizedTemplates = new Map(
  targetLocales.map((locale) => [
    locale,
    import(`/src/__generated__/locales/${locale}.ts`),
  ]),
);

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: string) =>
    localizedTemplates.get(locale as (typeof targetLocales)[number]),
});

const defaultDateOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

const defaultDurationOptions: Intl.DurationFormatOptions = {
  style: "narrow",
};

/**
 * Merge app language, app settings, and navigator language into a single list of languages.
 * @param targetLang The app language
 * @param useNavigatorLocales Use navigator languages not matching app target language
 * @param navigatorLocales List of requested languages (from `navigator.languages`)
 * @returns List of locales for formatting quantities (e.g. dates, numbers, bytes, etc)
 */
export function mergeLocales(
  targetLang: LanguageCode,
  useNavigatorLocales: boolean,
  navigatorLocales: readonly string[],
) {
  if (useNavigatorLocales) {
    return uniq([...navigatorLocales, targetLang]);
  }
  return uniq([
    ...navigatorLocales.filter(
      (lang) => new Intl.Locale(lang).language === targetLang,
    ),
    targetLang,
  ]);
}

/**
 * Cached number formatter, with smart defaults.
 *
 * Uses {@linkcode cached} to keep a smart auto-filling and self-clearing cache,
 * keyed by app language, user language preferences (from app settings and from
 * navigator), and formatter options.
 */
const numberFormatter = cached(
  (
    lang: LanguageCode,
    useNavigatorLocales: boolean,
    navigatorLocales: readonly string[],
    options?: Intl.NumberFormatOptions,
  ) =>
    new Intl.NumberFormat(
      mergeLocales(lang, useNavigatorLocales, navigatorLocales),
      options,
    ),
);

/**
 * Cached date/time formatter, with smart defaults.
 *
 * Uses {@linkcode cached} to keep a smart auto-filling and self-clearing cache,
 * keyed by app language, user language preferences (from app settings and from
 * navigator), and formatter options.
 */
const dateFormatter = cached(
  (
    lang: LanguageCode,
    useNavigatorLocales: boolean,
    navigatorLocales: readonly string[],
    options: Intl.DateTimeFormatOptions = defaultDateOptions,
  ) =>
    new Intl.DateTimeFormat(
      mergeLocales(lang, useNavigatorLocales, navigatorLocales),
      options,
    ),
);

/**
 * Cached duration formatter, with smart defaults.
 *
 * Uses {@linkcode cached} to keep a smart auto-filling and self-clearing cache,
 * keyed by app language, user language preferences (from app settings and from
 * navigator), and formatter options.
 */
const durationFormatter = cached(
  (
    lang: LanguageCode,
    useNavigatorLocales: boolean,
    navigatorLocales: readonly string[],
    options: Intl.DurationFormatOptions = defaultDurationOptions,
  ) =>
    new Intl.DurationFormat(
      mergeLocales(lang, useNavigatorLocales, navigatorLocales),
      options,
    ),
);

const pluralFormatter = cached(
  (
    lang: LanguageCode,
    useNavigatorLocales: boolean,
    navigatorLocales: readonly string[],
    options: Intl.PluralRulesOptions,
  ) =>
    new Intl.PluralRules(
      mergeLocales(lang, useNavigatorLocales, navigatorLocales),
      options,
    ),
);

export class Localize {
  get activeLanguage() {
    // Use html `lang` as the source of truth since that's
    // the attribute watched by Shoelace
    return new Intl.Locale(document.documentElement.lang)
      .language as LanguageCode;
  }
  private set activeLanguage(lang: LanguageCode) {
    // Setting the `lang` attribute will automatically localize
    // all Shoelace elements and `BtrixElement`s
    document.documentElement.lang = mergeLocales(
      lang,
      false,
      navigator.languages,
    )[0];
  }

  get activeLocales() {
    return mergeLocales(
      localize.activeLanguage,
      appState.userPreferences?.useBrowserLanguageForFormatting ?? true,
      navigator.languages,
    );
  }

  get languages() {
    return appState.settings?.localesEnabled ?? translatedLocales;
  }

  constructor(initialLanguage: LanguageCode = sourceLocale) {
    void this.setLanguage(initialLanguage);
  }

  async initLanguage() {
    await this.setLanguage(getDefaultLang());
  }

  /**
   * User-initiated language setting
   */
  async setLanguage(lang: LanguageCode) {
    const { error } = languageCodeSchema.safeParse(lang);

    if (error) {
      console.error("Error setting language:", error.issues[0]);
      return;
    }

    this.activeLanguage = lang;
    await this.setTranslation(lang);
  }

  readonly number = (n: number, opts?: Intl.NumberFormatOptions) => {
    if (isNaN(n)) return "";

    const formatter = numberFormatter(
      localize.activeLanguage,
      appState.userPreferences?.useBrowserLanguageForFormatting ?? true,
      navigator.languages,
      opts,
    );

    return formatter.format(n);
  };

  // Custom date formatter that takes missing `Z` into account
  readonly date = (
    d: Date | string | null,
    opts?: Intl.DateTimeFormatOptions,
  ) => {
    if (!d) {
      return "";
    }
    const date = new Date(d instanceof Date || d.endsWith("Z") ? d : `${d}Z`);

    const formatter = dateFormatter(
      localize.activeLanguage,
      appState.userPreferences?.useBrowserLanguageForFormatting ?? true,
      navigator.languages,
      opts,
    );

    return formatter.format(date);
  };

  readonly duration = (
    d: Intl.DurationType,
    opts?: Intl.DurationFormatOptions,
  ) => {
    const formatter = durationFormatter(
      localize.activeLanguage,
      appState.userPreferences?.useBrowserLanguageForFormatting ?? true,
      navigator.languages,
      opts,
    );

    return formatter.format(d);
  };

  private async setTranslation(lang: LanguageCode) {
    if (
      lang !== getLocale() &&
      (translatedLocales as AllLanguageCodes).includes(lang)
    ) {
      await setLocale(lang);
    }
  }

  readonly ordinal = (
    value: number,
    phrases: Record<Intl.LDMLPluralRule, string>,
  ) => {
    const formatter = pluralFormatter(
      localize.activeLanguage,
      appState.userPreferences?.useBrowserLanguageForFormatting ?? true,
      navigator.languages,
      { type: "ordinal" },
    );
    const pluralRule = formatter.select(value);
    return phrases[pluralRule];
  };
}

const localize = new Localize(sourceLocale);

export default localize;

export function getDefaultLang() {
  // Default to current user browser language
  return match(
    appState.userPreferences?.language
      ? [appState.userPreferences.language]
      : navigator.languages,
    appState.settings?.localesEnabled ?? translatedLocales,
    sourceLocale,
  ) as LanguageCode;
}
