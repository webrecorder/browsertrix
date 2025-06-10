import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import type { FileRemoveEvent } from "./events";

import { TailwindElement } from "@/classes/TailwindElement";
import { LocalizeController } from "@/controllers/localize";
import { truncate } from "@/utils/css";

/**
 * @event btrix-remove FileRemoveEvent
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

  @property({ type: Number })
  progressValue?: number;

  @property({ type: Boolean })
  progressIndeterminate?: boolean;

  readonly localize = new LocalizeController(this);

  render() {
    if (!this.file) return;
    return html`<div class="item">
      <div class="file">
        <div class="details">
          <div class="name">${this.file.name}</div>
          <div class="size">
            ${this.progressValue !== undefined
              ? html`${this.localize.bytes(
                  (this.progressValue / 100) * this.file.size,
                )}
                / `
              : ""}${this.localize.bytes(this.file.size)}
          </div>
        </div>
        <div class="actions">
          ${this.progressValue || this.progressIndeterminate
            ? ""
            : html`<sl-icon-button
                name="trash3"
                class="text-base hover:text-danger"
                label=${msg("Remove file")}
                @click=${this.onRemove}
              ></sl-icon-button>`}
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

  private readonly onRemove = async () => {
    if (!this.file) return;
    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<FileRemoveEvent["detail"]>("btrix-remove", {
        detail: {
          item: this.file,
        },
        composed: true,
        bubbles: true,
      }),
    );
  };
}
