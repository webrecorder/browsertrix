import { LitElement, html, css } from "lit";
import { state, property } from "lit/decorators.js";
import { localized, msg } from "@lit/localize";
import sortBy from "lodash/fp/sortBy";
import ISO6391 from "iso-639-1";
import type { LanguageCode } from "iso-639-1";

const languages = sortBy("name")(
  ISO6391.getLanguages(ISO6391.getAllCodes())
) as unknown as Array<{
  code: LanguageCode;
  name: string;
  nativeName: string;
}>;

/**
 * Choose language from dropdown
 *
 * Usage:
 * ```ts
 * <btrix-language-select @sl-select=${console.debug}>
 *   <span slot="label">Label</span>
 * </btrix-language-select>
 * ```
 */
@localized()
export class LanguageSelect extends LitElement {
  static styles = css`
    sl-select::part(control) {
      box-shadow: var(--sl-shadow-small);
    }

    sl-menu-item:not(:hover) .nativeName {
      color: var(--sl-color-neutral-400);
    }

    sl-menu-item:not(:hover) .code {
      color: var(--sl-color-neutral-600);
    }
  `;

  @property({ type: Boolean })
  hoist = false;

  render() {
    return html`
      <sl-select clearable placeholder=${msg("Default")} ?hoist=${this.hoist}>
        <div slot="label"><slot name="label"></slot></div>
        ${languages.map(
          ({ code, name, nativeName }) => html`
            <sl-menu-item value=${code}>
              ${name} <span class="nativeName">(${nativeName})</span>
              <code slot="suffix" class="code">${code}</code>
            </sl-menu-item>
          `
        )}
      </sl-select>
    `;
  }
}
