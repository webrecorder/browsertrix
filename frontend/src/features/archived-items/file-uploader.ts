import { localized, msg } from "@lit/localize";
import type { SlButton } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAsync, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import throttle from "lodash/fp/throttle";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { FileRemoveEvent } from "@/components/ui/file-list";
import type { BtrixFileChangeEvent } from "@/components/ui/file-list/events";
import type {
  TagInputEvent,
  Tags,
  TagsChangeEvent,
} from "@/components/ui/tag-input";
import { type CollectionsChangeEvent } from "@/features/collections/collections-add";
import { APIError } from "@/utils/api";
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

enum AbortReason {
  UserCancel = "user-canceled",
  QuotaReached = "storage_quota_reached",
}

/**
 * Usage:
 * ```ts
 * <btrix-file-uploader
 *   ?open=${this.open}
 *   @request-close=${this.requestClose}
 *   @uploaded=${this.uploaded}
 * ></btrix-file-uploader>
 * ```
 *
 * @TODO Refactor to use this.api.upload
 *
 * @event request-close
 * @event upload-start
 * @event uploaded
 */
@customElement("btrix-file-uploader")
@localized()
export class FileUploader extends BtrixElement {
  @property({ type: Boolean })
  open = false;

  @state()
  private isUploading = false;

  @state()
  private isDialogVisible = false;

  @state()
  private isConfirmingCancel = false;

  @state()
  private collectionIds: string[] = [];

  @state()
  private tagOptions: Tags = [];

  @state()
  private tagsToSave: Tags = [];

  @state()
  private fileList: File[] = [];

  @state()
  private progress = 0;

  @queryAsync("#fileUploadForm")
  private readonly form!: Promise<HTMLFormElement>;

  // For fuzzy search:
  private readonly fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private readonly validateDescriptionMax = maxLengthValidator(500);

  // Use to cancel requests
  private uploadRequest: XMLHttpRequest | null = null;

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("open") && this.open) {
      void this.fetchTags();

      if (changedProperties.get("open") === undefined) {
        this.isDialogVisible = true;
      }
    }
    if (changedProperties.get("isDialogVisible") && !this.isDialogVisible) {
      this.resetState();
    }
  }

  render() {
    const uploadInProgress = this.isUploading || this.isConfirmingCancel;
    return html`
      <btrix-dialog
        .label=${msg("Upload WACZ")}
        .open=${this.open}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
        @sl-request-close=${this.tryRequestClose}
        style="--width: ${uploadInProgress ? 40 : 60}rem;"
      >
        ${when(this.isDialogVisible, () =>
          uploadInProgress ? this.renderUploading() : this.renderForm(),
        )}
      </btrix-dialog>
    `;
  }

  private renderForm() {
    return html`
      <form
        id="fileUploadForm"
        @submit=${this.onSubmit}
        @reset=${this.tryRequestClose}
      >
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
          ?loading=${this.isUploading}
          ?disabled=${!this.fileList.length || this.isUploading}
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

        <p class="text-xs text-neutral-500">
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
      <btrix-tag-input
        .tagOptions=${this.tagOptions}
        @tag-input=${this.onTagInput}
        @tags-change=${(e: TagsChangeEvent) =>
          (this.tagsToSave = e.detail.tags)}
      ></btrix-tag-input>
      <div class="mt-4">
        <btrix-collections-add
          .initialCollections=${this.collectionIds}
          .configId=${"temp"}
          label=${msg("Add to Collection")}
          @collections-change=${(e: CollectionsChangeEvent) =>
            (this.collectionIds = e.detail.collections)}
        >
        </btrix-collections-add>
      </div>
    `;
  }

  private renderUploading() {
    if (this.isConfirmingCancel) {
      return html`
        <div class="flex flex-col items-center gap-5 p-5">
          <p class="text-lg font-semibold leading-none">
            ${msg("Cancel this upload?")}
          </p>
          <div class="w-full">
            <btrix-file-list>
              ${Array.from(this.fileList).map(
                (file) =>
                  html`<btrix-file-list-item
                    .file=${file}
                    progressValue=${this.progress}
                    @btrix-remove=${this.handleRemoveFile}
                  ></btrix-file-list-item>`,
              )}
            </btrix-file-list>
          </div>
          <div class="flex gap-3">
            <sl-button
              size="small"
              @click=${() => (this.isConfirmingCancel = false)}
            >
              ${msg("No")}
            </sl-button>
            <sl-button
              variant="primary"
              size="small"
              @click=${() => {
                this.cancelUpload();
                this.requestClose();
              }}
            >
              ${msg("Yes")}
            </sl-button>
          </div>
        </div>
      `;
    }
    return html`
      <section class="flex flex-col gap-3">
        <h4 class="flex-0 text-lg font-semibold leading-none">
          ${msg("Uploading...")}
        </h4>
        <p class="text-neutral-500">
          ${msg("Keep this window open until your upload finishes.")}
        </p>
        <main class="flex-1 overflow-auto">
          <btrix-file-list>
            ${Array.from(this.fileList).map(
              (file) =>
                html`<btrix-file-list-item
                  .file=${file}
                  progressValue=${this.progress}
                  @btrix-remove=${this.handleRemoveFile}
                ></btrix-file-list-item>`,
            )}
          </btrix-file-list>
        </main>
      </section>
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" @click=${() => this.tryRequestClose()}>
          ${msg("Cancel")}
        </sl-button>
      </div>
    `;
  }

  private readonly handleRemoveFile = (e: FileRemoveEvent) => {
    this.cancelUpload();
    const idx = this.fileList.indexOf(e.detail.item);
    if (idx === -1) return;
    this.fileList = [
      ...this.fileList.slice(0, idx),
      ...this.fileList.slice(idx + 1),
    ];
  };

  private cancelUpload() {
    this.uploadRequest?.abort();
    this.onUploadProgress.cancel();
  }

  private resetState() {
    this.fileList = [];
    this.tagsToSave = [];
    this.isUploading = false;
    this.isConfirmingCancel = false;
    this.progress = 0;
  }

  private tryRequestClose(e?: CustomEvent) {
    if (this.isUploading) {
      e?.preventDefault();
      this.isConfirmingCancel = true;
    } else {
      this.requestClose();
    }
  }

  private requestClose() {
    this.dispatchEvent(
      new CustomEvent("request-close") as FileUploaderRequestCloseEvent,
    );
  }

  private readonly onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    try {
      const tags = await this.api.fetch<never>(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
      );

      // Update search/filter collection
      this.fuse.setCollection(tags);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const file = this.fileList[0] as File | undefined;
    if (!file) return;

    this.isUploading = true;
    this.dispatchEvent(
      new CustomEvent("upload-start", {
        detail: {
          fileName: file.name,
          fileSize: file.size,
        },
      }) as FileUploaderUploadedEvent,
    );

    const { name, description } = serialize(formEl);
    try {
      const query = queryString.stringify({
        filename: file.name,
        name,
        description: description,
        collections: this.collectionIds,
        tags: this.tagsToSave,
      });

      const data = await this.upload(
        `orgs/${this.orgId}/uploads/stream?${query}`,
        file,
      );

      this.uploadRequest = null;

      // Dispatch event here because we're not using apiFetch() for uploads
      if (data.storageQuotaReached) {
        this.dispatchEvent(
          new CustomEvent("btrix-storage-quota-update", {
            detail: { reached: true },
            bubbles: true,
          }),
        );
      }

      if (data.id && data.added) {
        this.dispatchEvent(
          new CustomEvent("uploaded", {
            detail: {
              fileName: file.name,
              fileSize: file.size,
            },
          }) as FileUploaderUploadedEvent,
        );
        this.requestClose();
        this.notify.toast({
          message: msg(
            html`Successfully uploaded <strong>${name}</strong>.<br />
              <a
                class="underline hover:no-underline"
                href="${this.navigate.orgBasePath}/items/upload/${data.id}"
                @click="${this.navigate.link}"
                >View Item</a
              > `,
          ),
          variant: "success",
          icon: "check2-circle",
          id: "file-upload-status",
        });
      } else {
        throw data;
      }
    } catch (err) {
      if (err === AbortReason.UserCancel) {
        console.debug("Upload aborted to user cancel");
      } else {
        let message = msg("Sorry, couldn't upload file at this time.");
        console.debug(err);
        if (err === AbortReason.QuotaReached) {
          message = msg(
            "Your org does not have enough storage to upload this file.",
          );
          this.dispatchEvent(
            new CustomEvent("btrix-storage-quota-update", {
              detail: { reached: true },
              bubbles: true,
            }),
          );
        }
        this.notify.toast({
          message: message,
          variant: "danger",
          icon: "exclamation-octagon",
          id: "file-upload-status",
        });
      }
    }
    this.isUploading = false;
  }

  // Use XHR to get upload progress
  private async upload(
    url: string,
    file: File,
  ): Promise<{ id: string; added: boolean; storageQuotaReached: boolean }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("PUT", `/api/${url}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      Object.entries(this.authState!.headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          resolve(
            JSON.parse(xhr.response as string) as {
              id: string;
              added: boolean;
              storageQuotaReached: boolean;
            },
          );
        }
        if (xhr.status === 403) {
          reject(AbortReason.QuotaReached);
        }
      });
      xhr.addEventListener("error", () => {
        reject(
          new APIError({
            message: xhr.statusText,
            status: xhr.status,
          }),
        );
      });
      xhr.addEventListener("abort", () => {
        reject(AbortReason.UserCancel);
      });
      xhr.upload.addEventListener("progress", this.onUploadProgress);

      xhr.send(file);

      this.uploadRequest = xhr;
    });
  }

  private readonly onUploadProgress = throttle(100)((e: ProgressEvent) => {
    this.progress = (e.loaded / e.total) * 100;
  });

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
