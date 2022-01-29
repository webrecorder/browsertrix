import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

/**
 * Copy text to clipboard on click
 *
 * Usage example:
 * ```ts
 * <btrix-copy-button .value=${value} @on-copied=${console.log}></btrix-copy-button>
 * ```
 *
 * @event on-copied
 */
@localized()
export class CopyButton extends LitElement {
  @property({ type: String })
  value?: string;

  @state()
  private isCopied: boolean = false;

  timeoutId?: number;

  static copyToClipboard(value: string) {
    navigator.clipboard.writeText(value);
  }

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
    CopyButton.copyToClipboard(this.value!);

    this.isCopied = true;

    this.dispatchEvent(new CustomEvent("on-copied", { detail: this.value }));

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
    }, 3000);
  }
}
