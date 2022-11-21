import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { localized, msg } from "@lit/localize";
import ISO6391 from "iso-639-1";

const languages = ISO6391.getLanguages(ISO6391.getAllCodes());

/**
 * Choose language from dropdown
 */
@localized()
export class LanguageSelect extends LitElement {
  static styles = css`
    sl-menu-item:not(:hover) .nativeName {
      color: var(--sl-color-neutral-400);
    }

    sl-menu-item:not(:hover) .code {
      color: var(--sl-color-neutral-600);
    }
  `;

  @property({ type: String })
  name?: string;

  render() {
    return html`
      <sl-select
        name=${ifDefined(this.name)}
        clearable
        placeholder=${msg("Default")}
      >
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
