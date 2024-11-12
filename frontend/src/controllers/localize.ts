import { configureLocalization } from "@lit/localize";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import uniq from "lodash/fp/uniq";

import { sourceLocale, targetLocales } from "@/__generated__/locale-codes";
import {
  languageCodeSchema,
  translatedLocales,
  type AllLanguageCodes,
  type LanguageCode,
} from "@/types/localization";
import { getLang, langShortCode } from "@/utils/localization";
import { numberFormatter } from "@/utils/number";
import appState from "@/utils/state";

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: string) =>
    import(`/src/__generated__/locales/${locale}.ts`),
});

// Shared throughout app:
let activeLanguage = sourceLocale;
const defaultNumberFormatter = numberFormatter(activeLanguage);
const numberFormatters = new Map([[activeLanguage, defaultNumberFormatter]]);

export const localizedNumberFormat = (
  numberFormatters.get(activeLanguage) || defaultNumberFormatter
).format;

export function getActiveLanguage() {
  return activeLanguage;
}

/**
 * Manage app localization
 */
export class LocalizeController implements ReactiveController {
  private readonly host: ReactiveControllerHost & EventTarget;

  get activeLanguage() {
    return activeLanguage;
  }
  set activeLanguage(val) {
    activeLanguage = val;
  }

  get number() {
    return (numberFormatters.get(this.activeLanguage) || defaultNumberFormatter)
      .format;
  }

  get languages() {
    return uniq([
      ...translatedLocales,
      ...window.navigator.languages.map(langShortCode),
    ]);
  }

  constructor(host: LocalizeController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  initLanguage() {
    this.setLanguage(
      appState.userPreferences?.language || getLang() || sourceLocale,
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

    numberFormatters.set(lang, numberFormatter(lang));

    this.activeLanguage = lang;
    this.setTranslation(lang);
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
