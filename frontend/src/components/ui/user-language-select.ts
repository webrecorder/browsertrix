import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type TranslatedLocaleEnum } from "@/types/localization";
import localize from "@/utils/localize";

/**
 * Select language that Browsertrix app will be shown in
 */
@customElement("btrix-user-language-select")
export class LocalePicker extends BtrixElement {
  @state()
  private localeNames: { [locale: string]: string } = {};

  firstUpdated() {
    this.setLocaleNames();
  }

  private setLocaleNames() {
    const localeNames: LocalePicker["localeNames"] = {};

    localize.languages.forEach((locale) => {
      const name = new Intl.DisplayNames([locale], {
        type: "language",
      }).of(locale);

      if (!name) return;

      localeNames[locale] = name;
    });

    this.localeNames = localeNames;
  }

  render() {
    const selectedLocale = this.localize.lang();

    return html`
      <sl-dropdown
        @sl-select=${this.localeChanged}
        placement="top-end"
        distance="4"
        hoist
      >
        <sl-button
          slot="trigger"
          size="small"
          caret
          ?disabled=${localize.languages.length < 2}
        >
          <sl-icon slot="prefix" name="translate"></sl-icon>
          <span class="capitalize"
            >${this.localeNames[selectedLocale as TranslatedLocaleEnum]}</span
          >
        </sl-button>
        <sl-menu>
          ${Object.keys(this.localeNames)
            .sort()
            .map(
              (locale) =>
                html`<sl-menu-item
                  class="capitalize"
                  type="checkbox"
                  value=${locale}
                  ?checked=${locale === selectedLocale}
                >
                  ${this.localeNames[locale]}
                </sl-menu-item>`,
            )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  async localeChanged(event: SlSelectEvent) {
    const newLocale = event.detail.item.value as TranslatedLocaleEnum;

    localize.setLanguage(newLocale);
  }
}
