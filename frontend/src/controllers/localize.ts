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
import appState, { AppStateService } from "@/utils/state";

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale: string) =>
    import(`/src/__generated__/locales/${locale}.ts`),
});

/**
 * Manage app localization
 */
export class LocalizeController implements ReactiveController {
  private readonly host: ReactiveControllerHost & EventTarget;

  private activeLocale: LanguageCode = sourceLocale;

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
    this.activeLocale = appState.userLanguage || getLang() || sourceLocale;

    this.setTranslation(this.activeLocale);
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

    this.activeLocale = lang;
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
