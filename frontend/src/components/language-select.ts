import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { localized, msg } from "@lit/localize";
import sortBy from "lodash/fp/sortBy";
import ISO6391 from "iso-639-1";
import type { LanguageCode } from "iso-639-1";
import type { SlSelect } from "@shoelace-style/shoelace";

const languages = sortBy("name")(
  ISO6391.getLanguages(ISO6391.getAllCodes())
) as unknown as Array<{
  code: LanguageCode;
  name: string;
  nativeName: string;
}>;

/**
 * Choose language from dropdown.
 * Uses ISO 639-1 codes (2 letters representing macrolanguages.)
 *
 * Usage:
 * ```ts
 * <btrix-language-select value=${defaultValue} @on-change=${console.debug}>
 *   <span slot="label">Label</span>
 * </btrix-language-select>
 * ```
 *
 * @event on-change
 */
@localized()
export class LanguageSelect extends LitElement {
  static styles = css`
    sl-select::part(control) {
      box-shadow: var(--sl-shadow-small);
    }

    sl-menu-item:not(:hover) .secondaryText {
      color: var(--sl-color-neutral-400);
    }
  `;

  @property({ type: String })
  value?: LanguageCode;

  @property({ type: Boolean })
  hoist = false;

  render() {
    return html`
      <sl-select
        placeholder=${msg("Browser Default")}
        value=${ifDefined(this.value)}
        ?hoist=${this.hoist}
        @sl-change=${(e: Event) => {
          e.stopPropagation();

          this.dispatchEvent(
            new CustomEvent("on-change", {
              detail: {
                value: (e.target as SlSelect).value,
              },
            })
          );
        }}
      >
        <div slot="label"><slot name="label">${msg("Language")}</slot></div>
        ${languages.map(
          ({ code, name, nativeName }) => html`
            <sl-option value=${code}>
              ${name} <span class="secondaryText">(${nativeName})</span>
            </sl-option>
          `
        )}
      </sl-select>
    `;
  }
}
