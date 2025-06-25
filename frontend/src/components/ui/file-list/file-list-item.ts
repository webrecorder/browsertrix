import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { BtrixFileRemoveEvent } from "./events";
import type { FileLike } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { LocalizeController } from "@/controllers/localize";
import { truncate } from "@/utils/css";

/**
 * @event btrix-remove
 */
@customElement("btrix-file-list-item")
@localized()
export class FileListItem extends TailwindElement {
  static styles = [
    truncate,
    css`
      .item {
        overflow: hidden;
        border-top: var(--item-border-top, 0);
        border-left: var(--item-border-left, 0);
        border-right: var(--item-border-right, 0);
        border-bottom: var(--item-border-bottom, 0);
        border-radius: var(--item-border-radius, 0);
        box-shadow: var(--item-box-shadow, none);
        color: var(--sl-color-neutral-700);
      }

      .file {
        display: flex;
      }

      .details {
        flex: 1 1 0%;
        min-width: 0;
        padding: var(--sl-spacing-x-small);
      }

      .name {
        word-break: break-all;
      }

      .size {
        font-size: var(--sl-font-size-x-small);
        font-family: var(--font-monostyle-family);
        font-variation-settings: var(--font-monostyle-variation);
        color: var(--sl-color-neutral-500);
      }

      .actions {
        padding: var(--sl-spacing-3x-small);
      }

      .progress {
        padding: 0 var(--sl-spacing-x-small) var(--sl-spacing-x-small);
      }
    `,
  ];

  @property({ attribute: false })
  file?: File | null = null;

  @property({ type: String })
  name?: FileLike["name"];

  @property({ type: Number })
  size?: FileLike["size"];

  @property({ type: Boolean })
  removable = true;

  /**
   * Shows link to open the file URL in a new tab.
   */
  @property({ type: String })
  href = "";

  @property({ type: Number })
  progressValue?: number;

  @property({ type: Boolean })
  progressIndeterminate?: boolean;

  readonly localize = new LocalizeController(this);

  get item() {
    return (
      this.file ||
      (this.name ? { name: this.name, size: this.size || 0 } : null)
    );
  }

  render() {
    const item = this.item;

    if (!item) return;

    console.log(this.href);

    return html`<div class="item">
      <div class="file">
        <div class="details">
          <div class="name">${item.name}</div>
          <div class="size">
            ${this.progressValue !== undefined
              ? html`${this.localize.bytes(
                  (this.progressValue / 100) * item.size,
                )}
                / `
              : ""}${this.localize.bytes(item.size)}
          </div>
        </div>
        <div class="actions">
          ${this.progressValue || this.progressIndeterminate
            ? ""
            : this.renderActions()}
        </div>
      </div>
      ${this.progressValue || this.progressIndeterminate
        ? html`<div class="progress">
            <sl-progress-bar
              value=${this.progressValue || 0}
              ?indeterminate=${this.progressIndeterminate}
              style="--height: 0.25rem;"
            ></sl-progress-bar>
          </div>`
        : ""}
    </div>`;
  }

  private renderActions() {
    return html`${when(
      this.href,
      (href) =>
        html`<sl-tooltip content=${msg("View File")}>
          <sl-icon-button
            name="box-arrow-up-right"
            class="text-base"
            href=${href}
            target="_blank"
          ></sl-icon-button>
        </sl-tooltip>`,
    )}
    ${when(
      this.removable,
      () =>
        html`<sl-tooltip content=${msg("Remove File")}>
          <sl-icon-button
            name="trash3"
            class="text-base hover:text-danger"
            @click=${this.onRemove}
          ></sl-icon-button>
        </sl-tooltip>`,
    )}`;
  }

  private readonly onRemove = async () => {
    const item = this.item;

    if (!item) return;

    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<BtrixFileRemoveEvent["detail"]>("btrix-remove", {
        detail: { item },
        composed: true,
        bubbles: true,
      }),
    );
  };
}
