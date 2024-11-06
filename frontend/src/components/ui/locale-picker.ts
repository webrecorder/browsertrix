import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { allLocales, type LocaleCodeEnum } from "@/types/localization";
import { getLocale } from "@/utils/localization";

type LocaleNames = {
  [L in LocaleCodeEnum]: string;
};

@localized()
@customElement("btrix-locale-picker")
export class LocalePicker extends BtrixElement {
  @state()
  private localeNames: LocaleNames | undefined = {} as LocaleNames;

  private readonly setLocaleName = (locale: LocaleCodeEnum) => {
    this.localeNames![locale] = new Intl.DisplayNames([locale], {
      type: "language",
    }).of(locale)!;
  };

  firstUpdated() {
    this.localeNames = {} as LocaleNames;
    allLocales.forEach(this.setLocaleName);
  }

  render() {
    if (!this.localeNames) {
      return;
    }

    const selectedLocale = this.appState.userPreferences?.locale || getLocale();

    return html`
      <sl-dropdown placement="top-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${this.localeNames[selectedLocale as LocaleCodeEnum]}</sl-button
        >
        <sl-menu>
          ${allLocales.map(
            (locale) =>
              html`<sl-menu-item
                type="checkbox"
                value=${locale}
                ?checked=${locale === selectedLocale}
              >
                ${this.localeNames![locale]}
              </sl-menu-item>`,
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }
}
