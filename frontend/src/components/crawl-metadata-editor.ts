import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import Fuse from "fuse.js";

import type { Tags, TagInputEvent, TagsChangeEvent } from "./tag-input";
import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { maxLengthValidator } from "../utils/form";
import type { Crawl } from "../types/crawler";

/**
 * Usage:
 * ```ts
 * <btrix-crawl-metadata-editor
 *   .authState=${this.authState}
 *   .crawl=${this.crawl}
 *   ?open=${this.open}
 *   @request-close=${this.requestClose}
 *   @updated=${this.updated}
 * ></btrix-crawl-metadata-editor>
 * ```
 *
 * @event request-close
 * @event updated
 */
@localized()
export class CrawlMetadataEditor extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  crawl?: Crawl;

  @property({ type: Boolean })
  open = false;

  @state()
  private canEditName = false;

  @state()
  private isSubmittingUpdate: boolean = false;

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private includeName: boolean = false;

  @state()
  private tagOptions: Tags = [];

  @state()
  private tagsToSave: Tags = [];

  // For fuzzy search:
  private fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  private validateCrawlDescriptionMax = maxLengthValidator(500);

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("open") && this.open) {
      this.fetchTags();
    }
    if (changedProperties.has("crawl") && this.crawl) {
      this.includeName = this.crawl.type === "upload";
      this.tagsToSave = this.crawl.tags || [];
    }
  }

  render() {
    return html`
      <btrix-dialog
        label=${msg("Edit Metadata")}
        ?open=${this.open}
        @sl-show=${() => (this.isDialogVisible = true)}
        @sl-after-hide=${() => (this.isDialogVisible = false)}
        @sl-request-close=${this.requestClose}
      >
        ${this.isDialogVisible ? this.renderEditMetadata() : ""}
      </btrix-dialog>
    `;
  }

  private renderEditMetadata() {
    if (!this.crawl) return;

    const { helpText, validate } = this.validateCrawlDescriptionMax;
    return html`
      <form
        id="crawlDetailsForm"
        @submit=${this.onSubmitMetadata}
        @reset=${this.requestClose}
      >
        ${this.includeName
          ? html`
              <div class="mb-3">
                <sl-input label="Name" name="name" value="${this.crawl.name}">
                </sl-input>
              </div>
            `
          : ``}
        <sl-textarea
          class="mb-3 with-max-help-text"
          name="crawlDescription"
          label=${msg("Description")}
          value=${this.crawl.description || ""}
          rows="3"
          autocomplete="off"
          resize="auto"
          help-text=${helpText}
          @sl-input=${validate}
        ></sl-textarea>
        <btrix-tag-input
          .initialTags=${this.crawl.tags}
          .tagOptions=${this.tagOptions}
          @tag-input=${this.onTagInput}
          @tags-change=${(e: TagsChangeEvent) =>
            (this.tagsToSave = e.detail.tags)}
        ></btrix-tag-input>
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button form="crawlDetailsForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="crawlDetailsForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmittingUpdate}
          ?disabled=${this.isSubmittingUpdate}
          >${msg("Save")}</sl-button
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
    if (!this.crawl) return;
    try {
      const tags = await this.apiFetch(
        `/orgs/${this.crawl.oid}/crawlconfigs/tags`,
        this.authState!
      );

      // Update search/filter collection
      this.fuse.setCollection(tags as any);
    } catch (e) {
      // Fail silently, since users can still enter tags
      console.debug(e);
    }
  }

  private async onSubmitMetadata(e: SubmitEvent) {
    e.preventDefault();
    if (!this.crawl) return;

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;
    const { crawlDescription, name } = serialize(formEl);

    if (
      (!this.includeName || name === this.crawl.name) &&
      crawlDescription === (this.crawl!.description ?? "") &&
      JSON.stringify(this.tagsToSave) === JSON.stringify(this.crawl!.tags)
    ) {
      // No changes have been made
      this.requestClose();
      return;
    }

    const params = {
      tags: this.tagsToSave,
      description: crawlDescription,
      name,
    };

    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/${
          this.crawl!.type === "crawl" ? "crawls" : "uploads"
        }/${this.crawl.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        }
      );

      if (!data.updated) {
        throw data;
      }

      this.dispatchEvent(new CustomEvent("updated"));
      this.notify({
        message: msg("Successfully saved crawl details."),
        variant: "success",
        icon: "check2-circle",
      });
      this.requestClose();
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't save crawl details at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
