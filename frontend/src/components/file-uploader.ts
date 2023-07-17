import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";
import queryString from "query-string";
import type { SlButton } from "@shoelace-style/shoelace";
import { snakeCase } from "lodash/fp";

import type { Tags, TagInputEvent, TagsChangeEvent } from "./tag-input";
import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { maxLengthValidator } from "../utils/form";
import type { FileRemoveEvent } from "./file-list";

const ABORT_REASON_USER_CANCEL = "user-canceled";

/**
 * Usage:
 * ```ts
 * <btrix-file-uploader
 *   .authState=${this.authState}
 *   ?open=${this.open}
 *   @request-close=${this.requestClose}
 *   @uploaded=${this.uploaded}
 * ></btrix-file-uploader>
 * ```
 *
 * @event request-close
 * @event uploaded
 */
@localized()
export class FileUploader extends LiteElement {
  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private tagOptions: Tags = [];

  @state()
  private tagsToSave: Tags = [];

  @state()
  private fileList: File[] = [];

  // For fuzzy search:
  private fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private validateDescriptionMax = maxLengthValidator(500);

  // Use to cancel requests
  private uploadController: AbortController | null = null;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("open") && this.open) {
      this.fetchTags();

      if (changedProperties.get("open") === undefined) {
        this.isDialogVisible = true;
      }
    }
    if (changedProperties.has("isDialogVisible") && !this.isDialogVisible) {
      this.resetForm();
    }
  }

  render() {
    return html`
      <btrix-dialog
        label=${msg("Upload Archive")}
        ?open=${this.open}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
        @sl-request-close=${this.requestClose}
        style="--width:60rem"
      >
        ${this.isDialogVisible ? this.renderForm() : ""}
      </btrix-dialog>
    `;
  }

  private renderForm() {
    return html`
      <form
        id="fileUploadForm"
        @submit=${this.onSubmit}
        @reset=${this.requestClose}
      >
        <div class="grid md:grid-cols-2 gap-5">
          <section class="col-span-1 flex flex-col gap-3">
            <h4 class="flex-0 text-lg leading-none font-semibold">
              ${msg("File")}
            </h4>
            <main class="flex-1 border rounded p-3">${this.renderFiles()}</main>
          </section>
          <section class="col-span-1 flex flex-col gap-3">
            <h4 class="flex-0 text-lg leading-none font-semibold">
              ${msg("Metadata")}
            </h4>
            <main class="flex-1 border rounded py-3 px-4">
              ${this.renderMetadata()}
            </main>
          </section>
        </div>
      </form>

      <div slot="footer" class="flex justify-between">
        <sl-button form="fileUploadForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="fileUploadForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmittingUpdate}
          ?disabled=${!this.fileList.length || this.isSubmittingUpdate}
          >${msg("Upload Archive")}</sl-button
        >
      </div>
    `;
  }

  private renderFiles() {
    if (!this.fileList.length) {
      return html`
        <div class="h-full flex flex-col gap-3 items-center justify-center">
          <label>
            <input
              class="sr-only"
              type="file"
              accept=".wacz"
              @change=${(e: Event) => {
                const files = (e.target as HTMLInputElement).files as FileList;
                if (files?.length) {
                  this.fileList = Array.from(files);
                }
              }}
            />
            <sl-button
              variant="primary"
              @click=${(e: MouseEvent) =>
                (e.target as SlButton).parentElement?.click()}
              >${msg("Browse Files")}</sl-button
            >
          </label>
          <p class="text-xs text-neutral-500">
            ${msg("Select a .wacz file to upload")}
          </p>
        </div>
      `;
    }

    return html`
      <btrix-file-list>
        ${Array.from(this.fileList).map(
          (file) => html`<btrix-file-list-item
            .file=${file}
            @on-remove=${this.handleRemoveFile}
          ></btrix-file-list-item>`
        )}
      </btrix-file-list>
    `;
  }

  private renderMetadata() {
    const { helpText, validate } = this.validateDescriptionMax;
    return html`
      <div class="mb-3">
        <sl-input label="Name" name="name" required></sl-input>
      </div>
      <sl-textarea
        class="mb-3 with-max-help-text"
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
      <div class="mt-3">
        <btrix-collections-add
          .authState=${this.authState}
          .initialCollections=${[]}
          .orgId=${this.orgId}
          .configId=${"temp"}
          label=${msg("Add to Collection")}
          @collections-change=${(e: any) => console.log(e.detail.collections)}
        >
        </btrix-collections-add>
      </div>
    `;
  }

  private handleRemoveFile = (e: FileRemoveEvent) => {
    this.cancelUpload();
    const idx = this.fileList.indexOf(e.detail.file);
    if (idx === -1) return;
    this.fileList = [
      ...this.fileList.slice(0, idx),
      ...this.fileList.slice(idx + 1),
    ];
  };

  private cancelUpload() {
    if (this.uploadController) {
      this.uploadController.abort(ABORT_REASON_USER_CANCEL);
      this.uploadController = null;
    }
  }

  private resetForm() {
    this.fileList = [];
    this.tagsToSave = [];
    this.isSubmittingUpdate = false;
  }

  private requestClose() {
    this.cancelUpload();
    this.dispatchEvent(new CustomEvent("request-close"));
  }

  private onTagInput = (e: TagInputEvent) => {
    const { value } = e.detail;
    if (!value) return;
    this.tagOptions = this.fuse.search(value).map(({ item }) => item);
  };

  private async fetchTags() {
    try {
      const tags = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/tags`,
        this.authState!
      );

      // Update search/filter collection
      this.fuse.setCollection(tags as any);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;
    const { name, description } = serialize(formEl);

    this.isSubmittingUpdate = true;

    try {
      const file = this.fileList[0];
      const filename = file?.name || snakeCase(name as string);
      const query = queryString.stringify({
        filename,
        name,
        notes: description,
        // TODO tags with API support
        // tags: this.tagsToSave
      });
      this.uploadController = new AbortController();
      const data: { id: string; added: boolean } = await this.apiFetch(
        `/orgs/${this.orgId}/uploads/stream?${query}`,
        this.authState!,
        {
          method: "PUT",
          body: file?.stream(),
          signal: this.uploadController.signal,
        }
      );
      this.uploadController = null;

      if (data.id && data.added) {
        this.dispatchEvent(new CustomEvent("uploaded"));
        this.notify({
          message: msg("Successfully uploaded file."),
          variant: "success",
          icon: "check2-circle",
        });
        this.requestClose();
      } else {
        throw data;
      }
    } catch (err: any) {
      if (err === ABORT_REASON_USER_CANCEL) {
        console.debug("Fetch crawls aborted to user cancel");
      } else {
        this.notify({
          message: msg("Sorry, couldn't upload file at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }

    this.isSubmittingUpdate = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
