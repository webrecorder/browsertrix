import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { SlTextarea } from "@shoelace-style/shoelace";
import Fuse from "fuse.js";

import type { Tags, TagInputEvent, TagsChangeEvent } from "./tag-input";
import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import type { Crawl } from "../types/crawler";

const CRAWL_NOTES_MAXLENGTH = 500;

/**
 * Usage:
 * ```ts
 *
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
  private isSubmittingUpdate: boolean = false;

  @state()
  private isDialogVisible: boolean = false;

  @state()
  private tagOptions: Tags = [];

  @state()
  private tagsToSave: Tags = [];

  // For fuzzy search:
  private fuse = new Fuse([], {
    shouldSort: false,
    threshold: 0.2, // stricter; default is 0.6
  });

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("open") && this.open) {
      this.fetchTags();
    }
    if (changedProperties.has("crawl") && this.crawl) {
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

    const crawlNotesHelpText = msg(
      str`Maximum ${CRAWL_NOTES_MAXLENGTH} characters`
    );
    return html`
      <form
        id="crawlDetailsForm"
        @submit=${this.onSubmitMetadata}
        @reset=${this.requestClose}
      >
        <sl-textarea
          class="mb-3"
          name="crawlNotes"
          label=${msg("Notes")}
          value=${this.crawl.notes || ""}
          rows="3"
          autocomplete="off"
          resize="auto"
          help-text=${crawlNotesHelpText}
          style="--help-text-align: right"
          @sl-input=${(e: CustomEvent) => {
            const textarea = e.target as SlTextarea;
            if (textarea.value.length > CRAWL_NOTES_MAXLENGTH) {
              const overMax = textarea.value.length - CRAWL_NOTES_MAXLENGTH;
              textarea.setCustomValidity(
                msg(
                  str`Please shorten this text to ${CRAWL_NOTES_MAXLENGTH} or less characters.`
                )
              );
              textarea.helpText =
                overMax === 1
                  ? msg(str`${overMax} character over limit`)
                  : msg(str`${overMax} characters over limit`);
            } else {
              textarea.setCustomValidity("");
              textarea.helpText = crawlNotesHelpText;
            }
          }}
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
    const { crawlNotes } = serialize(formEl);

    if (
      crawlNotes === (this.crawl!.notes ?? "") &&
      JSON.stringify(this.tagsToSave) === JSON.stringify(this.crawl!.tags)
    ) {
      // No changes have been made
      this.requestClose();
      return;
    }

    const params = {
      tags: this.tagsToSave,
      notes: crawlNotes,
    };
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.crawl!.oid}/crawls/${this.crawl.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        }
      );

      if (!data.success) {
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
