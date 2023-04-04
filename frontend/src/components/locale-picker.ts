import { LitElement, html } from "lit";
import { state } from "lit/decorators.js";

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
