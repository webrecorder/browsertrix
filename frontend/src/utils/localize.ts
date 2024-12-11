/**
 * Manage translations and language-specific formatting throughout app
 *
 * @FIXME The Intl.DurationFormat polyfill is currently shimmed with webpack.ProvidePlugin
 * to avoid encoding issues when importing the polyfill asynchronously in the test server.
 * See https://github.com/web-dev-server/web-dev-server/issues/1
 */
import { configureLocalization } from "@lit/localize";
import uniq from "lodash/uniq";

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

const defaultDateOptions: Intl.DateTimeFormatOptions = {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

const defaultDurationOptions: Intl.DurationFormatOptions = {
  style: "narrow",
};

export class Localize {
  // Cache default formatters
  private readonly numberFormatter = new Map([
    [sourceLocale, numberFormatter(withUserLocales(sourceLocale))],
  ]);
  private readonly dateFormatter = new Map([
    [
      sourceLocale,
      new Intl.DateTimeFormat(
        withUserLocales(sourceLocale),
        defaultDateOptions,
      ),
    ],
  ]);
  private readonly durationFormatter = new Map([
    [
      sourceLocale,
      new Intl.DurationFormat(
        withUserLocales(sourceLocale),
        defaultDurationOptions,
      ),
    ],
  ]);

  get activeLanguage() {
    // Use html `lang` as the source of truth since that's
    // the attribute watched by Shoelace
    return new Intl.Locale(document.documentElement.lang)
      .language as LanguageCode;
  }
  private set activeLanguage(lang: LanguageCode) {
    // Setting the `lang` attribute will automatically localize
    // all Shoelace elements and `BtrixElement`s
    document.documentElement.lang = withUserLocales(lang)[0];
  }

  get languages() {
    return appState.settings?.localesEnabled ?? translatedLocales;
  }

  constructor(initialLanguage: LanguageCode = sourceLocale) {
    this.setLanguage(initialLanguage);
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
      console.error("Error setting language:", error.issues[0]);
      return;
    }

    if (!this.numberFormatter.get(lang)) {
      this.numberFormatter.set(lang, numberFormatter(withUserLocales(lang)));
    }
    if (!this.dateFormatter.get(lang)) {
      this.dateFormatter.set(
        lang,
        new Intl.DateTimeFormat(withUserLocales(lang), defaultDateOptions),
      );
    }
    if (!this.durationFormatter.get(lang)) {
      this.durationFormatter.set(
        lang,
        new Intl.DurationFormat(withUserLocales(lang), defaultDurationOptions),
      );
    }

    this.activeLanguage = lang;
    this.setTranslation(lang);
  }

  readonly number = (
    n: number,
    opts?: Intl.NumberFormatOptions & { ordinal?: boolean },
  ) => {
    if (isNaN(n)) return "";

    let formatter = this.numberFormatter.get(localize.activeLanguage);

    if ((opts && !opts.ordinal) || !formatter) {
      formatter = new Intl.NumberFormat(
        withUserLocales(localize.activeLanguage),
        opts,
      );
    }

    return formatter.format(n, opts);
  };

  // Custom date formatter that takes missing `Z` into account
  readonly date = (d: Date | string, opts?: Intl.DateTimeFormatOptions) => {
    const date = new Date(d instanceof Date || d.endsWith("Z") ? d : `${d}Z`);

    let formatter = this.dateFormatter.get(localize.activeLanguage);

    if (opts || !formatter) {
      formatter = new Intl.DateTimeFormat(
        withUserLocales(localize.activeLanguage),
        opts,
      );
    }

    return formatter.format(date);
  };

  readonly duration = (
    d: Intl.DurationType,
    opts?: Intl.DurationFormatOptions,
  ) => {
    let formatter = this.durationFormatter.get(localize.activeLanguage);

    if (opts || !formatter) {
      formatter = new Intl.DurationFormat(
        withUserLocales(localize.activeLanguage),
        opts,
      );
    }

    return formatter.format(d);
  };

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

function langShortCode(locale: string) {
  return new Intl.Locale(locale).language as LanguageCode;
}

export function withUserLocales(targetLang: LanguageCode) {
  return uniq([
    ...window.navigator.languages.filter(
      (lang) => new Intl.Locale(lang).language === targetLang,
    ),
    targetLang,
  ]);
}

export function getBrowserLang() {
  // Default to current user browser language
  const browserLanguage = window.navigator.language;
  if (browserLanguage) {
    return langShortCode(browserLanguage);
  }
  return null;
}
