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

  @property({ type: String })
  name?: string;

  @property({ type: String })
  content?: string;

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
      <sl-tooltip
        content=${this.isCopied
          ? msg("Copied to clipboard!")
          : this.content
          ? this.content
          : msg("Copy")}
      >
        <sl-icon-button
          name=${this.isCopied ? "check-lg" : this.name ? this.name : "files"}
          label=${msg("Copy to clipboard")}
          @click=${this.onClick}
          ?disabled=${!this.value && !this.getValue}
        ></sl-icon-button>
      </sl-tooltip>
    `;
  }

  private onClick() {
    const value = (this.getValue ? this.getValue() : this.value) || "";
    CopyButton.copyToClipboard(value);

    this.isCopied = true;

    this.dispatchEvent(new CustomEvent("on-copied", { detail: value }));

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
      const button = this.shadowRoot?.querySelector("sl-icon-button");
      button?.blur(); // Remove focus from the button to set it back to its default state
    }, 3000);
  }
}
