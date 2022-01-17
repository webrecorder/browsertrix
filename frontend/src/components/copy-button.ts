import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

/**
 * Copy text to clipboard on click
 *
 * Usage example:
 * ```ts
 * <btrix-copy-button .value=${value}></btrix-copy-button>
 * ```
 */
@localized()
export class CopyButton extends LitElement {
  @property({ type: String })
  value?: string;

  @state()
  private isCopied: boolean = false;

  timeoutId?: number;

  disconnectedCallback() {
    window.clearTimeout(this.timeoutId);
  }

  render() {
    return html`
      <sl-button size="small" @click=${this.onClick} ?disabled=${!this.value}
        >${this.isCopied ? msg("Copied") : msg("Copy")}</sl-button
      >
    `;
  }

  private onClick() {
    navigator.clipboard.writeText(this.value!);

    this.isCopied = true;

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
    }, 3000);
  }
}
