import { localized } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { tw } from "@/utils/tailwind";

export type BtrixFileChangeEvent = BtrixChangeEvent<FileList>;

/**
 * Allow attaching one or more files.
 *
 * @fires btrix-change
 */
@customElement("btrix-file-input")
@localized()
export class FileInput extends TailwindElement {
  /**
   * Specify which file types are allowed
   */
  @property({ type: String })
  accept?: HTMLInputElement["accept"];

  /**
   * Enable selecting more than one file
   */
  @property({ type: Boolean })
  multiple?: HTMLInputElement["multiple"];

  /**
   * Enable dragging files into drop zone
   */
  @property({ type: Boolean })
  dropzone = false;

  @query("input[type='file']")
  private readonly input?: HTMLInputElement | null;

  render() {
    return html`<label
      class=${clsx(
        tw`cursor-pointer`,
        this.dropzone &&
          tw`block rounded p-6 text-center outline-dashed outline-1 -outline-offset-1 outline-neutral-400 transition-all hover:outline-primary-400`,
      )}
      @drop=${this.dropzone ? this.onDrop : undefined}
      @dragover=${this.dropzone ? this.onDragover : undefined}
    >
      <input
        class="sr-only"
        type="file"
        accept=${ifDefined(this.accept)}
        ?multiple=${this.multiple}
        @change=${() => {
          const files = this.input?.files;

          if (files) {
            void this.handleChange(files);
          }
        }}
      />
      <slot @click=${() => this.input?.click()}></slot>
    </label>`;
  }

  private readonly onDrop = (e: DragEvent) => {
    e.preventDefault();

    if (e.dataTransfer?.files) {
      void this.handleChange(e.dataTransfer.files);
    } else {
      console.debug("no files dropped");
    }
  };

  private readonly onDragover = (e: DragEvent) => {
    e.preventDefault();
  };

  private async handleChange(files: FileList) {
    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<BtrixFileChangeEvent["detail"]>("btrix-change", {
        detail: { value: files },
        composed: true,
        bubbles: true,
      }),
    );
  }
}
