import { localized } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { sourceLocale } from "@/__generated__/locale-codes";
import { BtrixElement } from "@/classes/BtrixElement";
import { allLocales, type LocaleCodeEnum } from "@/types/localization";
import { getLocale, setLocale } from "@/utils/localization";
import { AppStateService } from "@/utils/state";

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

    const selectedLocale =
      this.appState.userPreferences?.locale || sourceLocale;

    return html`
      <sl-dropdown
        @sl-select=${this.localeChanged}
        placement="top-end"
        distance="4"
        hoist
      >
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

  async localeChanged(event: SlSelectEvent) {
    const newLocale = event.detail.item.value as LocaleCodeEnum;

    AppStateService.partialUpdateUserPreferences({ locale: newLocale });

    if (newLocale !== getLocale()) {
      void setLocale(newLocale);
    }
  }
}
