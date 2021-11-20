import { LitElement, html } from "lit";

import { allLocales } from "../__generated__/locale-codes";
import { getLocale, setLocaleFromUrl } from "../utils/localization";
import { localized } from "@lit/localize";

const localeNames: {
  [L in typeof allLocales[number]]: string;
} = {
  en: "English",
  ko: "ko",
};

// Note we use updateWhenLocaleChanges here so that we're always up to date with
// the active locale (the result of getLocale()) when the locale changes via a
// history navigation.
@localized()
export class LocalePicker extends LitElement {
  render() {
    return html`
      <select @change=${this.localeChanged}>
        ${allLocales.map(
          (locale) =>
            html`<option value=${locale} ?selected=${locale === getLocale()}>
              ${localeNames[locale]}
            </option>`
        )}
      </select>
    `;
  }

  localeChanged(event: Event) {
    const newLocale = (event.target as HTMLSelectElement).value;
    if (newLocale !== getLocale()) {
      const url = new URL(window.location.href);
      url.searchParams.set("locale", newLocale);
      window.history.pushState(null, "", url.toString());
      setLocaleFromUrl();
    }
  }
}
