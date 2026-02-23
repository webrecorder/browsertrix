import { localized, msg } from "@lit/localize";
import type { SlTextarea } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Tags } from "@/components/ui/tag-input";
import type { BtrixTagsChangeEvent } from "@/features/archived-items/item-tags-input";
import type {
  CollectionsAdd,
  CollectionsChangeEvent,
} from "@/features/collections/collections-add";
import type { ArchivedItem } from "@/types/crawler";
import { isSuccessfullyFinished } from "@/utils/crawler";
import { maxLengthValidator } from "@/utils/form";

/**
 * Usage:
 * ```ts
 * <btrix-item-metadata-editor
 *   .crawl=${this.crawl}
 *   ?open=${this.open}
 *   @request-close=${this.requestClose}
 *   @updated=${this.updated}
 * ></btrix-item-metadata-editor>
 * ```
 *
 * @event request-close
 * @event updated
 */
@customElement("btrix-item-metadata-editor")
@localized()
export class CrawlMetadataEditor extends BtrixElement {
  @property({ type: Object })
  crawl?: ArchivedItem;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmittingUpdate = false;

  @state()
  private isDialogVisible = false;

  @state()
  private includeName = false;

  @state()
  private tagsToSave: Tags = [];

  @state()
  private collectionsToSave: string[] = [];

  @query("#description-input")
  public readonly descriptionInput?: SlTextarea | null;

  @query("#collection-input")
  public readonly collectionInput?: CollectionsAdd | null;

  private readonly validateCrawlDescriptionMax = maxLengthValidator(500);

  willUpdate(changedProperties: Map<string, never>) {
    if (changedProperties.has("crawl") && this.crawl) {
      this.includeName = this.crawl.type === "upload";
      this.tagsToSave = this.crawl.tags;
      this.collectionsToSave = this.crawl.collectionIds;
    }
  }

  render() {
    const isSuccess = this.crawl && isSuccessfullyFinished(this.crawl);

    return html`
      <btrix-dialog
        .label=${isSuccess ? msg("Edit Archived Item") : msg("Edit Metadata")}
        .open=${this.open}
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

    const item = this.crawl;
    const isSuccess = isSuccessfullyFinished(item);

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
                <sl-input label="Name" name="name" value="${item.name}">
                </sl-input>
              </div>
            `
          : ``}
        <sl-textarea
          id="description-input"
          class="with-max-help-text mb-3"
          name="crawlDescription"
          label=${msg("Description")}
          value=${item.description || ""}
          rows="3"
          autocomplete="off"
          resize="auto"
          help-text=${helpText}
          @sl-input=${validate}
        ></sl-textarea>
        <btrix-item-tags-input
          .tags=${item.tags}
          @btrix-tags-change=${(e: BtrixTagsChangeEvent) => {
            this.tagsToSave = e.detail.value;
          }}
        ></btrix-item-tags-input>
        ${when(
          isSuccess,
          () => html`
            <div class="mt-7">
              <btrix-collections-add
                id="collection-input"
                .collectionIds=${item.collectionIds}
                label=${msg("Include in Collection")}
                @collections-change=${(e: CollectionsChangeEvent) =>
                  (this.collectionsToSave = e.detail.collections)}
              >
              </btrix-collections-add>
            </div>
          `,
        )}
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

  private async onSubmitMetadata(e: SubmitEvent) {
    e.preventDefault();
    if (!this.crawl) return;

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;
    const { crawlDescription, name } = serialize(formEl);

    const params: {
      collectionIds?: string[];
      tags?: string[];
      description?: string;
      name?: string;
    } = {};
    if (this.includeName && name && name !== this.crawl.name) {
      params.name = name as string;
    }
    if (
      crawlDescription &&
      crawlDescription !== (this.crawl.description ?? "")
    ) {
      params.description = crawlDescription as string;
    }
    if (JSON.stringify(this.tagsToSave) !== JSON.stringify(this.crawl.tags)) {
      params.tags = this.tagsToSave;
    }
    if (
      JSON.stringify(this.collectionsToSave) !==
      JSON.stringify(this.crawl.collectionIds)
    ) {
      params.collectionIds = this.collectionsToSave;
    }

    if (!Object.keys(params).length) {
      // No changes have been made
      this.requestClose();
      return;
    }

    this.isSubmittingUpdate = true;

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.crawl.oid}/all-crawls/${this.crawl.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        },
      );

      if (!data.updated) {
        throw data;
      }

      this.dispatchEvent(new CustomEvent("updated"));
      this.notify.toast({
        message: msg("Successfully updated item."),
        variant: "success",
        icon: "check2-circle",
        id: "crawl-details-update-status",
      });
      this.requestClose();
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't save item at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-details-update-status",
      });
    }

    this.isSubmittingUpdate = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
