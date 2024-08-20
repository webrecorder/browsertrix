import { localized, msg } from "@lit/localize";
import type { SlSelect } from "@shoelace-style/shoelace";
import ISO6391, { type LanguageCode } from "iso-639-1";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import sortBy from "lodash/fp/sortBy";

const languages = sortBy("name")(
  ISO6391.getLanguages(ISO6391.getAllCodes()),
) as unknown as {
  code: LanguageCode;
  name: string;
  nativeName: string;
}[];

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
@customElement("btrix-language-select")
@localized()
export class LanguageSelect extends LitElement {
  // postcss-lit-disable-next-line
  static styles = css`
    sl-select::part(control) {
      box-shadow: var(--sl-shadow-small);
    }
  `;

  @property({ type: String })
  size?: SlSelect["size"];

  @property({ type: String })
  value?: LanguageCode;

  @property({ type: Boolean })
  hoist = false;

  render() {
    return html`
      <sl-select
        placeholder=${msg("Browser Default")}
        value=${ifDefined(this.value)}
        size=${ifDefined(this.size)}
        ?hoist=${this.hoist}
        @sl-change=${async (e: Event) => {
          e.stopPropagation();

          this.value = (e.target as SlSelect).value as LanguageCode;

          await this.updateComplete;

          this.dispatchEvent(
            new CustomEvent("on-change", {
              detail: {
                value: this.value,
              },
            }),
          );
        }}
      >
        <div slot="label"><slot name="label">${msg("Language")}</slot></div>
        ${languages.map(
          ({ code, name, nativeName }) => html`
            <sl-option value=${code}>
              ${name} ${name !== nativeName ? `(${nativeName})` : nothing}
            </sl-option>
          `,
        )}
      </sl-select>
    `;
  }
}
