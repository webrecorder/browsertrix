import { localized } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { without } from "lodash/fp";

import type {
  BtrixFileChangeEvent,
  BtrixFileRemoveEvent,
} from "./file-list/events";

import { TailwindElement } from "@/classes/TailwindElement";
import { FormControl } from "@/mixins/FormControl";
import { tw } from "@/utils/tailwind";

import "@/components/ui/file-list";

const droppingClass = tw`bg-slate-100`;

/**
 * Allow attaching one or more files.
 *
 * @fires btrix-change
 * @fires btrix-remove
 */
@customElement("btrix-file-input")
@localized()
export class FileInput extends FormControl(TailwindElement) {
  /**
   * Form control name, if used as a form control
   */
  @property({ type: String })
  name?: string;

  /**
   * Form control label, if used as a form control
   */
  @property({ type: String })
  label?: string;

  /**
   * Selected files.
   */
  @property({ type: Array })
  files?: File[] | null = null;

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
  drop = false;

  @query("#dropzone")
  private readonly dropzone?: HTMLElement | null;

  @query("input[type='file']")
  private readonly input?: HTMLInputElement | null;

  formResetCallback() {
    this.files = [];

    if (this.input) {
      this.input.value = "";
    }
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("files")) {
      this.syncFormValue();
    }
  }

  private syncFormValue() {
    const formControlName = this.name;

    if (!formControlName) return;

    // `ElementInternals["setFormValue"]` doesn't support `FileList` yet,
    // construct `FormData` instead
    const formData = new FormData();

    this.files?.forEach((file) => {
      formData.append(formControlName, file);
    });

    this.setFormValue(formData);
  }

  render() {
    return html`
      ${this.label
        ? html`<label for="fileInput" class="form-label">${this.label}</label>`
        : nothing}
      ${this.files?.length ? this.renderFiles() : this.renderInput()}
    `;
  }

  private readonly renderInput = () => {
    return html`
      <div
        id="dropzone"
        class=${clsx(
          this.drop
            ? tw`flex size-full cursor-pointer items-center justify-center rounded p-6 text-center outline-dashed outline-1 -outline-offset-1 outline-neutral-400 transition-all hover:bg-slate-50 hover:outline-primary-400`
            : tw`size-max`,
        )}
        @drop=${this.drop ? this.onDrop : undefined}
        @dragover=${this.drop ? this.onDragover : undefined}
        @dragenter=${this.drop
          ? () => this.dropzone?.classList.add(droppingClass)
          : undefined}
        @dragleave=${this.drop
          ? () => this.dropzone?.classList.remove(droppingClass)
          : undefined}
        @click=${() => this.input?.click()}
        role="button"
        dropzone="copy"
        aria-dropeffect="copy"
      >
        <input
          id="fileInput"
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
        <div class="relative z-10">
          <slot
            @slotchange=${{
              // Hide input visually
              handleEvent: () => this.input?.classList.add(tw`sr-only`),
              once: true,
            }}
          ></slot>
        </div>
      </div>
    `;
  };

  private readonly renderFiles = () => {
    if (!this.files) return;

    return html`
      <btrix-file-list
        @btrix-remove=${(e: BtrixFileRemoveEvent) => {
          this.files = without([e.detail.item])(this.files);
        }}
      >
        ${repeat(
          this.files,
          (file) => file.name,
          (file) => html`
            <btrix-file-list-item .file=${file}></btrix-file-list-item>
          `,
        )}
      </btrix-file-list>
    `;
  };

  private readonly onDrop = (e: DragEvent) => {
    e.preventDefault();

    this.dropzone?.classList.remove(droppingClass);

    const files = e.dataTransfer?.files;

    if (files) {
      const list = new DataTransfer();

      if (this.multiple) {
        [...files].forEach((file) => {
          if (this.valid(file)) {
            list.items.add(file);
          }
        });
      } else {
        const file = files[0];

        if (this.valid(file)) {
          list.items.add(file);
        }
      }

      if (list.items.length) {
        void this.handleChange(list.files);
      } else {
        console.debug("none valid:", files);
      }
    } else {
      console.debug("no files dropped");
    }
  };

  private readonly onDragover = (e: DragEvent) => {
    e.preventDefault();

    if (e.dataTransfer) {
      this.dropzone?.classList.add(droppingClass);
      e.dataTransfer.dropEffect = "copy";
    }
  };

  /**
   * @TODO More complex validation based on `accept`
   */
  private valid(file: File) {
    if (!this.accept) return true;

    return this.accept.split(",").some((accept) => {
      if (accept.startsWith(".")) {
        return file.name.endsWith(accept.trim());
      }

      console.log("accept:", accept, file.type);

      return new RegExp(accept.trim().replace("*", ".*")).test(file.type);
    });
  }

  private async handleChange(fileList: FileList) {
    this.files = [...fileList];

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<BtrixFileChangeEvent["detail"]>("btrix-change", {
        detail: { value: this.files },
        composed: true,
        bubbles: true,
      }),
    );
  }
}
