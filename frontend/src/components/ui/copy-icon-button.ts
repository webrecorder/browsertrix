import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Button } from "@/components/ui/button";

/**
 * Copy text to clipboard on click
 *
 * Usage example:
 * ```ts
 * <btrix-copy-icon-button .value=${value}></btrix-copy-icon-button>
 * ```
 * Or:
 * ```ts
 * <btrix-copy-icon-button .getValue=${() => value}></btrix-copy-icon-button>
 * ```
 *
 * @fires btrix-copied
 */
@localized()
@customElement("btrix-copy-icon-button")
export class CopyIconButton extends TailwindElement {
  @property({ type: String })
  value?: string;

  @property({ type: String })
  name?: string;

  @property({ type: String })
  content?: string;

  @property({ attribute: false })
  getValue?: () => string | undefined;

  @property({ type: Boolean })
  hoist = false;

  @property({ type: Boolean })
  raised = false;

  @property({ type: String })
  size: "x-small" | "small" | "medium" = "small";

  @state()
  private isCopied = false;

  timeoutId?: number;

  static copyToClipboard(value: string) {
    void navigator.clipboard.writeText(value);
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
        ?hoist=${this.hoist}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        <btrix-button
          size=${this.size}
          @click=${this.onClick}
          ?disabled=${!this.value && !this.getValue}
          class="inline"
          ?raised=${this.raised}
        >
          <sl-icon
            name=${this.isCopied ? "check-lg" : this.name ? this.name : "copy"}
            label=${msg("Copy to clipboard")}
            class="size-3.5"
          ></sl-icon>
        </btrix-button>
      </sl-tooltip>
    `;
  }

  private onClick() {
    const value = (this.getValue ? this.getValue() : this.value) || "";
    CopyIconButton.copyToClipboard(value);

    this.isCopied = true;

    this.dispatchEvent(new CustomEvent("btrix-copied", { detail: value }));

    this.timeoutId = window.setTimeout(() => {
      this.isCopied = false;
      const button = this.shadowRoot?.querySelector<Button>("btrix-button");
      button?.blur(); // Remove focus from the button to set it back to its default state
    }, 3000);
  }

  /**
   * Stop propgation of sl-tooltip events.
   * Prevents bug where sl-dialog closes when tooltip closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
