import { localized, msg, str } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { MarkdownEditor } from "@/components/ui/markdown-editor";
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
@localized()
@customElement("btrix-collection-metadata-dialog")
export class CollectionMetadataDialog extends BtrixElement {
  @property({ type: Object })
  collection?: Collection;

  @property({ type: Boolean })
  open = false;

  @state()
  isDialogVisible = false;

  @state()
  private isSubmitting = false;

  @query("btrix-markdown-editor")
  private readonly descriptionEditor?: MarkdownEditor | null;

  @query("btrix-select-collection-access")
  private readonly selectCollectionAccess?: SelectCollectionAccess | null;

  @queryAsync("#collectionForm")
  private readonly form!: Promise<HTMLFormElement>;

  private readonly validateNameMax = maxLengthValidator(50);

  protected firstUpdated(): void {
    if (this.open) {
      this.isDialogVisible = true;
    }
  }

  render() {
    return html` <btrix-dialog
      label=${this.collection
        ? msg("Collection Settings")
        : msg("Create a New Collection")}
      ?open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-after-hide=${() => (this.isDialogVisible = false)}
      style="--width: 46rem"
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
        ${when(
          !this.collection,
          () => html`
            <aside class="text-xs text-neutral-500">
              ${msg("You can rename your collection later")}
            </aside>
          `,
        )}

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
          id="collectionForm-name-input"
          name="name"
          label=${msg("Name")}
          value=${this.collection?.name || ""}
          placeholder=${msg("My Collection")}
          autocomplete="off"
          required
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        ></sl-input>
        ${when(
          this.collection,
          () => html`
            <section>
              <div class="form-label">${msg("Thumbnail")}</div>
            </section>
          `,
          () => html`
            <btrix-markdown-editor
              label=${msg("Description")}
              initialValue=${this.collection?.description || ""}
              maxlength=${4000}
            ></btrix-markdown-editor>
            <sl-divider></sl-divider>
            <btrix-select-collection-access></btrix-select-collection-access>
          `,
        )}

        <input class="invisible size-0" type="submit" />
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
    const description = this.descriptionEditor?.value;
    if (
      !nameInput?.checkValidity() ||
      (description && !this.descriptionEditor.checkValidity())
    ) {
      return;
    }

    const { name } = serialize(form);

    this.isSubmitting = true;
    try {
      const body = JSON.stringify({
        name,
        description,
        access:
          this.selectCollectionAccess?.value ||
          this.collection?.access ||
          CollectionAccess.Private,
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
        message: msg(
          str`Successfully saved "${data.name || name}" Collection.`,
        ),
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
