import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { ClipboardController } from "@/controllers/clipboard";

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
 * @fires btrix-copied
 */
@customElement("btrix-copy-button")
@localized()
export class CopyButton extends TailwindElement {
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

  private readonly clipboardController = new ClipboardController(this);

  render() {
    return html`
      <sl-tooltip
        content=${this.clipboardController.isCopied
          ? ClipboardController.text.copied
          : this.content
            ? this.content
            : ClipboardController.text.copy}
        ?hoist=${this.hoist}
      >
        <btrix-button
          size=${this.size}
          @click=${this.onClick}
          ?disabled=${!this.value && !this.getValue}
          class="inline"
          ?raised=${this.raised}
        >
          <sl-icon
            name=${this.clipboardController.isCopied
              ? "check-lg"
              : this.name
                ? this.name
                : "copy"}
            label=${msg("Copy to clipboard")}
            class="size-3.5"
          ></sl-icon>
        </btrix-button>
      </sl-tooltip>
    `;
  }

  private onClick() {
    const value = (this.getValue ? this.getValue() : this.value) || "";

    void this.clipboardController.copy(value);
  }
}
