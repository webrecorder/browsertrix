import { localized, msg, str } from "@lit/localize";
import type { SlInput, SlSelectEvent } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { DEFAULT_THUMBNAIL } from "./collection-thumbnail";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { SelectCollectionAccess } from "@/features/collections/select-collection-access";
import { CollectionAccess, type Collection } from "@/types/collection";
import { isApiError } from "@/utils/api";
import { maxLengthValidator } from "@/utils/form";

export type CollectionSavedEvent = CustomEvent<{
  id: string;
}>;

/**
 * @fires btrix-collection-saved CollectionSavedEvent Fires
 */
@customElement("btrix-collection-metadata-dialog")
@localized()
export class CollectionMetadataDialog extends BtrixElement {
  @property({ type: Object })
  collection?: Collection;

  @property({ type: Boolean })
  open = false;

  @state()
  isDialogVisible = false;

  @state()
  private isSubmitting = false;

  @state()
  private showPublicWarning = false;

  @query("btrix-select-collection-access")
  private readonly selectCollectionAccess?: SelectCollectionAccess | null;

  @queryAsync("#collectionForm")
  private readonly form!: Promise<HTMLFormElement>;

  private readonly validateNameMax = maxLengthValidator(50);
  private readonly validateCaptionMax = maxLengthValidator(150);

  protected firstUpdated(): void {
    if (this.open) {
      this.isDialogVisible = true;
    }
  }

  render() {
    console.log("awa awa awaawawawa");
    return html`<btrix-dialog
      label=${this.collection
        ? msg("Edit Metadata")
        : msg("Create a New Collection")}
      ?open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-after-hide=${() => (this.isDialogVisible = false)}
      class="[--width:40rem]"
    >
      ${when(this.isDialogVisible, () => this.renderForm())}
      <div slot="footer" class="flex items-center justify-end gap-3">
        <sl-button
          class="mr-auto"
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
          ?loading=${this.isSubmitting}
          ?disabled=${this.isSubmitting}
          @click=${async () => {
            // Using submit method instead of type="submit" fixes
            // incorrect getRootNode in Chrome
            const form = await this.form;
            const submitInput = form.querySelector<HTMLInputElement>(
              'input[type="submit"]',
            );
            form.requestSubmit(submitInput);
          }}
          >${this.collection
            ? msg("Save")
            : msg("Create Collection")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private renderForm() {
    return html`
      <form id="collectionForm" @reset=${this.onReset} @submit=${this.onSubmit}>
        <sl-input
          class="with-max-help-text"
          name="name"
          label=${msg("Name")}
          value=${this.collection?.name || ""}
          placeholder=${msg("My Collection")}
          autocomplete="off"
          required
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        >
        </sl-input>
        <sl-textarea
          class="with-max-help-text"
          name="caption"
          value=${this.collection?.caption || ""}
          placeholder=${msg("Summarize the collection's content")}
          autocomplete="off"
          rows="2"
          help-text=${this.validateCaptionMax.helpText}
          @sl-input=${this.validateCaptionMax.validate}
        >
          <span slot="label">
            ${msg("Summary")}
            <sl-tooltip>
              <span slot="content">
                ${msg(
                  "Write a short description that summarizes this collection. If the collection is public, this description will be visible next to the collection name.",
                )}
                ${this.collection
                  ? nothing
                  : msg(
                      "You can write a longer description in the 'About' section after creating the collection.",
                    )}
              </span>
              <sl-icon
                name="info-circle"
                style="vertical-align: -.175em"
              ></sl-icon>
            </sl-tooltip>
          </span>
        </sl-textarea>
        ${when(
          !this.collection,
          () => html`
            <sl-divider></sl-divider>
            <btrix-select-collection-access
              @sl-select=${(e: SlSelectEvent) =>
                (this.showPublicWarning =
                  (e.detail.item.value as CollectionAccess) ===
                  CollectionAccess.Public)}
            ></btrix-select-collection-access>
          `,
        )}
        ${when(
          this.showPublicWarning && this.org,
          (org) => html`
            <btrix-alert variant="warning" class="mt-2">
              ${org.enablePublicProfile
                ? msg(
                    "This collection will be visible on the org public profile, even without archived items. You may want to set visibility to 'Unlisted' until archived items have been added.",
                  )
                : html`
                    ${msg(
                      "This collection will be visible on the org profile page, which isn't public yet. To make the org profile and this collection visible to the public, update org profile settings.",
                    )}
                    <a
                      class="ml-auto flex items-center gap-1.5 font-medium underline hover:no-underline"
                      href=${`${this.navigate.orgBasePath}/settings`}
                      target="_blank"
                    >
                      ${msg("Open org settings")}
                      <sl-icon name="box-arrow-up-right"></sl-icon>
                    </a>
                  `}
            </btrix-alert>
          `,
        )}

        <input class="offscreen" type="submit" />
      </form>
    `;
  }

  private async hideDialog() {
    void (await this.form).closest<Dialog>("btrix-dialog")!.hide();
  }

  private onReset() {
    void this.hideDialog();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector<SlInput>('sl-input[name="name"]');

    if (!nameInput?.checkValidity()) {
      return;
    }

    const { name, caption } = serialize(form);

    this.isSubmitting = true;
    try {
      const body = JSON.stringify({
        name,
        caption,
        access:
          this.selectCollectionAccess?.value ||
          this.collection?.access ||
          CollectionAccess.Private,
        defaultThumbnailName: DEFAULT_THUMBNAIL,
      });
      let path = `/orgs/${this.orgId}/collections`;
      let method = "POST";
      if (this.collection) {
        path = `/orgs/${this.orgId}/collections/${this.collection.id}`;
        method = "PATCH";
      }
      const data = await this.api.fetch<Collection>(path, {
        method,
        body,
      });

      this.dispatchEvent(
        new CustomEvent("btrix-collection-saved", {
          detail: {
            id: this.collection?.id || data.id,
          },
        }) as CollectionSavedEvent,
      );
      this.notify.toast({
        message: this.collection
          ? msg(str`"${data.name || name}" metadata updated`)
          : msg(str`Created "${data.name || name}" collection`),
        variant: "success",
        icon: "check2-circle",
        id: "collection-metadata-status",
      });
      void this.hideDialog();
    } catch (e) {
      let message = isApiError(e) && e.message;
      if (message === "collection_name_taken") {
        message = msg("This name is already taken.");
      }
      this.notify.toast({
        message: message || msg("Something unexpected went wrong"),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-metadata-status",
      });
    }

    this.isSubmitting = false;
  }
}
