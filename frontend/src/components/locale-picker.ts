import { LitElement, html } from "lit";
import { state } from "lit/decorators.js";
import { shouldPolyfill } from "@formatjs/intl-displaynames/should-polyfill";

import { allLocales } from "../__generated__/locale-codes";
import { getLocale, setLocaleFromUrl } from "../utils/localization";
import { localized } from "@lit/localize";

type LocaleCode = (typeof allLocales)[number];
type LocaleNames = {
  [L in LocaleCode]: string;
};

@localized()
export class LocalePicker extends LitElement {
  @state()
  private localeNames: LocaleNames = {} as LocaleNames;

  private setLocaleName = (locale: LocaleCode) => {
    this.localeNames[locale] = new Intl.DisplayNames([locale], {
      type: "language",
    }).of(locale)!;
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
  }

  render() {
    if (!this.localeNames) {
      return;
    }

    const selectedLocale = getLocale();

    return html`
      <sl-dropdown
        value=${selectedLocale}
        @sl-select=${this.localeChanged}
        placement="top-end"
        distance="4"
        hoist
      >
        <sl-button slot="trigger" size="small" caret
          >${this.localeNames[selectedLocale as LocaleCode]}</sl-button
        >
        <sl-menu>
          ${allLocales.map(
            (locale) =>
              html`<sl-menu-item
                value=${locale}
                ?checked=${locale === selectedLocale}
              >
                ${this.localeNames[locale]}
              </sl-menu-item>`
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  async localeChanged(event: CustomEvent) {
    const newLocale = event.detail.item.value as LocaleCode;

    if (newLocale !== getLocale()) {
      const url = new URL(window.location.href);
      url.searchParams.set("locale", newLocale);
      window.history.pushState(null, "", url.toString());
      setLocaleFromUrl();
    }
  }
}
