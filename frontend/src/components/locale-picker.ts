import { LitElement, html } from "lit";
import { shouldPolyfill } from "@formatjs/intl-displaynames/should-polyfill";

import { allLocales } from "../__generated__/locale-codes";
import { getLocale, setLocaleFromUrl } from "../utils/localization";
import { localized } from "@lit/localize";

type LocaleCode = typeof allLocales[number];
type LocaleNames = {
  [L in LocaleCode]: string;
};

@localized()
export class LocalePicker extends LitElement {
  localeNames?: LocaleNames;

  private setLocaleName = (locale: LocaleCode) => {
    // TODO figure out what version
    // https://github.com/microsoft/TypeScript/pull/45647
    // is in and remove `as any`
    this.localeNames![locale] = new (Intl as any).DisplayNames([locale], {
      type: "language",
    }).of(locale);
  };

  async firstUpdated() {
    let isFirstPolyfill = true;

    // Polyfill if needed
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames#browser_compatibility
    // TODO actually test if polyfill works in older browser
    const polyfill = async (locale: LocaleCode) => {
      if (!shouldPolyfill(locale)) {
        return;
      }

      if (isFirstPolyfill) {
        await import("@formatjs/intl-getcanonicallocales/polyfill");
        await import("@formatjs/intl-displaynames/polyfill");

        isFirstPolyfill = false;
      }

      try {
        await import("@formatjs/intl-displaynames/locale-data/" + locale);
      } catch (e) {
        console.debug(e);
      }
    };

    await Promise.all(
      allLocales.map((locale) => polyfill(locale as LocaleCode))
    );

    this.localeNames = {} as LocaleNames;
    allLocales.forEach(this.setLocaleName);

    this.requestUpdate();
  }

  render() {
    if (!this.localeNames) {
      return;
    }

    const selectedLocale = getLocale();

    return html`
      <sl-select value=${selectedLocale} @sl-change=${this.localeChanged}>
        ${allLocales.map(
          (locale) =>
            html`<sl-menu-item
              value=${locale}
              ?selected=${locale === selectedLocale}
            >
              ${this.localeNames![locale]}
            </sl-menu-item>`
        )}
      </sl-select>
    `;
  }

  async localeChanged(event: Event) {
    const newLocale = (event.target as HTMLSelectElement).value as LocaleCode;

    if (newLocale !== getLocale()) {
      const url = new URL(window.location.href);
      url.searchParams.set("locale", newLocale);
      window.history.pushState(null, "", url.toString());
      setLocaleFromUrl();
    }
  }
}
