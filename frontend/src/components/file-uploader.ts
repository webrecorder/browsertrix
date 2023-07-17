import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";

import type { Tags, TagInputEvent, TagsChangeEvent } from "./tag-input";
import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { maxLengthValidator } from "../utils/form";
import { PropertyValueMap } from "lit";

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

  @query("#fileInput")
  private fileInput?: HTMLInputElement;

  // For fuzzy search:
  private fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private validateDescriptionMax = maxLengthValidator(500);

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("open") && this.open) {
      this.fetchTags();
    }
  }

  firstUpdated(changedProperties: Map<string, any>) {
    if (changedProperties.has("open") && this.open) {
      this.isDialogVisible = true;
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
      >
        ${this.isDialogVisible ? html` ${this.renderFileInput()} ` : ""}
      </btrix-dialog>
    `;
  }

  private renderFileInput() {
    return html`
      <input
        id="fileInput"
        type="file"
        accept=".wacz"
        @change=${(e: Event) =>
          this.upload(((e.target as HTMLInputElement).files as FileList)[0])}
      />
    `;
  }

  private renderForm() {
    const { helpText, validate } = this.validateDescriptionMax;
    return html`
      <form
        id="fileUploadForm"
        @submit=${this.onSubmit}
        @reset=${this.requestClose}
      >
        <div class="mb-3">
          <sl-input label="Name" name="name"> </sl-input>
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
          ?disabled=${this.isSubmittingUpdate}
          >${msg("Upload")}</sl-button
        >
      </div>
    `;
  }

  private requestClose() {
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

  private async upload(file: File) {
    try {
      const data: { id: string; added: boolean } = await this.apiFetch(
        `/orgs/${this.orgId}/uploads/stream?filename=testing`,
        this.authState!,
        {
          method: "PUT",
          body: file.stream(),
        }
      );

      if (data.id && data.added) {
        //
      } else {
        throw data;
      }
    } catch (err) {
      console.log(err);
    }
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;
    const { name, description } = serialize(formEl);

    console.log(this.fileInput);

    console.log("TODO", name, description, this.tagsToSave);

    this.isSubmittingUpdate = true;

    try {
      // this.dispatchEvent(new CustomEvent("uploaded"));
      // this.notify({
      //   message: msg("Successfully uploaded file."),
      //   variant: "success",
      //   icon: "check2-circle",
      // });
      this.requestClose();
    } catch (e) {
      // this.notify({
      //   message: msg("Sorry, couldn't upload file at this time."),
      //   variant: "danger",
      //   icon: "exclamation-octagon",
      // });
    }

    this.isSubmittingUpdate = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
