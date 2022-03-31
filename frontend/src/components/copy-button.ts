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
 * Or:
 * ```ts
 * <btrix-copy-button .getValue=${() => value}></btrix-copy-button>
 * ```
 *
 * @event on-copied
 */
@localized()
export class CopyButton extends LitElement {
  @property({ type: String })
  value?: string;

  @property({ type: Function })
  getValue?: () => string;

  @state()
  private isCopied: boolean = false;

  timeoutId?: number;

  static copyToClipboard(value: string) {
    navigator.clipboard.writeText(value);
  }

  disconnectedCallback() {
    window.clearTimeout(this.timeoutId);
    super.disconnectedCallback();
  }

  render() {
    return html`
      <sl-button
        size="small"
        @click=${this.onClick}
        ?disabled=${!this.value && !this.getValue}
        >${this.isCopied ? msg("Copied") : msg("Copy")}</sl-button
      >
    `;
  }

  private onClick() {
    const value = (this.getValue ? this.getValue() : this.value) || "";
    CopyButton.copyToClipboard(value);

    this.isCopied = true;

    this.dispatchEvent(new CustomEvent("on-copied", { detail: value }));

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
    }, 3000);
  }
}
