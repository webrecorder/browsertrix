import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { sourceLocale } from "@/__generated__/locale-codes";
import { BtrixElement } from "@/classes/BtrixElement";
import { allLocales, type LocaleCodeEnum } from "@/types/localization";
import { getLocale, setLocale } from "@/utils/localization";
import { AppStateService } from "@/utils/state";

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

    // TODO Add browser-preferred languages
    // https://github.com/webrecorder/browsertrix/issues/2143
    allLocales.forEach((locale) => {
      const name = new Intl.DisplayNames([locale], {
        type: "language",
      }).of(locale);

      if (!name) return;

      localeNames[locale] = name;
    });

    this.localeNames = localeNames;
  }

  render() {
    const selectedLocale =
      this.appState.userPreferences?.locale || sourceLocale;

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
          ?disabled=${(allLocales as unknown as string[]).length < 2}
        >
          <sl-icon slot="prefix" name="translate"></sl-icon>
          <span class="capitalize"
            >${this.localeNames[selectedLocale as LocaleCodeEnum]}</span
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
    const newLocale = event.detail.item.value as LocaleCodeEnum;

    AppStateService.partialUpdateUserPreferences({ locale: newLocale });

    if (newLocale !== getLocale()) {
      void setLocale(newLocale);
    }
  }
}
