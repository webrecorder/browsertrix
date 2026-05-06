import { ContextConsumer } from "@lit/context";
import { localized, msg } from "@lit/localize";
import type { SlButton } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { FileRemoveEvent } from "@/components/ui/file-list";
import type { BtrixFileChangeEvent } from "@/components/ui/file-list/events";
import type { Tags } from "@/components/ui/tag-input";
import orgUploadsContext from "@/context/org-uploads";
import type { OrgUploadEventDetail } from "@/context/org-uploads/types";
import type { BtrixTagsChangeEvent } from "@/features/archived-items/item-tags-input";
import { type CollectionsChangeEvent } from "@/features/collections/collections-add";
import { maxLengthValidator } from "@/utils/form";

export type FileUploaderRequestCloseEvent = CustomEvent<NonNullable<unknown>>;
export type FileUploaderUploadStartEvent = CustomEvent<{
  fileName: string;
  fileSize: number;
}>;
export type FileUploaderUploadedEvent = CustomEvent<{
  fileName: string;
  fileSize: number;
}>;

/**
 * Usage:
 * ```ts
 * <btrix-file-uploader
 *   ?open=${this.open}
 * ></btrix-file-uploader>
 * ```
 *
 * @event request-CollectionSavedEvent
 */
@customElement("btrix-file-uploader")
@localized()
export class FileUploader extends BtrixElement {
  readonly #orgUploads = new ContextConsumer(this, {
    context: orgUploadsContext,
    subscribe: true,
    callback: (value) => {
      if (this.uploadingId && this.uploadingId in value) {
        // Finish with dialog once upload has begun
        this.uploadingId = undefined;
        this.close();
      }
    },
  });

  @property({ type: Boolean })
  open = false;

  @state()
  private uploadingId?: string;

  @state()
  private isDialogVisible = false;

  @state()
  private collectionIds: string[] = [];

  @state()
  private tagsToSave: Tags = [];

  @state()
  private fileList: File[] = [];

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @queryAsync("#fileUploadForm")
  private readonly form!: Promise<HTMLFormElement>;

  private readonly validateDescriptionMax = maxLengthValidator(500);

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("open") && this.open) {
      if (changedProperties.get("open") === undefined) {
        this.isDialogVisible = true;
      }
    }
    if (changedProperties.get("isDialogVisible") && !this.isDialogVisible) {
      this.resetState();
    }
  }

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Upload WACZ")}
        .open=${this.open}
        class="[--width:60rem]"
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
      >
        ${when(this.isDialogVisible, () => this.renderForm())}
      </btrix-dialog>
    `;
  }

  private renderForm() {
    const loading = Boolean(this.uploadingId);

    return html`
      <form id="fileUploadForm" @submit=${this.onSubmit} @reset=${this.close}>
        <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
          <section class="col-span-1 flex flex-col gap-3">
            <h3 class="flex-0 text-lg font-semibold leading-none">
              ${msg("File to Upload")}
            </h3>
            <main class="flex-1 rounded border p-3">${this.renderFiles()}</main>
          </section>
          <section class="col-span-1 flex flex-col gap-3">
            <h3 class="flex-0 text-lg font-semibold leading-none">
              ${msg("Metadata")}
            </h3>
            <main class="flex-1 rounded border px-4 py-3">
              ${this.renderMetadata()}
            </main>
          </section>
        </div>
        <input class="invisible size-0" type="submit" />
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button
          size="small"
          @click=${async () => {
            // Using reset method instead of type="reset" fixes
            // incorrect getRootNode in Chrome
            (await this.form).reset();
          }}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          variant="primary"
          size="small"
          ?loading=${loading}
          ?disabled=${!this.fileList.length || loading}
          @click=${async () => {
            // Using submit method instead of type="submit" fixes
            // incorrect getRootNode in Chrome
            const form = await this.form;
            const submitInput = form.querySelector<HTMLInputElement>(
              'input[type="submit"]',
            )!;
            form.requestSubmit(submitInput);
          }}
        >
          ${msg("Upload")}
        </sl-button>
      </div>
    `;
  }

  private renderFiles() {
    return html`
      <btrix-file-input
        accept=".wacz"
        drop
        @btrix-change=${(e: BtrixFileChangeEvent) => {
          this.fileList = e.detail.value;
        }}
        @btrix-remove=${this.handleRemoveFile}
      >
        <sl-button
          variant="primary"
          @click=${(e: MouseEvent) =>
            (e.target as SlButton).parentElement?.click()}
          >${msg("Browse Files")}</sl-button
        >

        <p class="mt-2.5 text-xs text-neutral-500">
          ${msg("Select a .wacz file to upload")}
        </p>
      </btrix-file-input>
    `;
  }

  private renderMetadata() {
    const { helpText, validate } = this.validateDescriptionMax;
    return html`
      <div class="mb-3">
        <sl-input
          label=${msg("Name")}
          name="name"
          placeholder=${msg("Our Website (example.com)")}
          required
        ></sl-input>
      </div>
      <sl-textarea
        class="with-max-help-text mb-3"
        name="description"
        label=${msg("Description")}
        rows="3"
        autocomplete="off"
        resize="auto"
        help-text=${helpText}
        @sl-input=${validate}
      ></sl-textarea>
      <btrix-item-tags-input
        @btrix-tags-change=${(e: BtrixTagsChangeEvent) => {
          this.tagsToSave = e.detail.value;
        }}
      ></btrix-item-tags-input>
      <div class="mt-4">
        <btrix-collections-add
          .collectionIds=${this.collectionIds}
          label=${msg("Add to Collection")}
          @collections-change=${(e: CollectionsChangeEvent) =>
            (this.collectionIds = e.detail.collections)}
        >
        </btrix-collections-add>
      </div>
    `;
  }

  private readonly handleRemoveFile = (e: FileRemoveEvent) => {
    const idx = this.fileList.indexOf(e.detail.item as File);
    if (idx === -1) return;
    this.fileList = [
      ...this.fileList.slice(0, idx),
      ...this.fileList.slice(idx + 1),
    ];
  };

  private resetState() {
    this.fileList = [];
    this.tagsToSave = [];
    this.uploadingId = undefined;
  }

  private readonly close = () => {
    void this.dialog?.hide();
  };

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const file = this.fileList[0] as File | undefined;
    if (!file) return;

    this.uploadingId = window.crypto.randomUUID();

    const { name, description } = serialize(formEl);
    const query = queryString.stringify({
      filename: file.name,
      name,
      description: description,
      collections: this.collectionIds,
      tags: this.tagsToSave,
    });

    // Dispatch information for upload to be handled on the org level
    this.dispatchEvent(
      new CustomEvent<OrgUploadEventDetail>("btrix-org-upload", {
        detail: {
          uploadId: this.uploadingId,
          itemName: name as string,
          apiPath: `/orgs/${this.orgId}/uploads/stream?${query}`,
          file,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
