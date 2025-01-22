import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import {
  getFormControls,
  serialize,
  type SlInput,
} from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";

import { type CollectionShareSettings } from "./edit-dialog/sharing-section";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type MarkdownEditor } from "@/components/ui/markdown-editor";
import { type TabGroupPanel } from "@/components/ui/tab-group/tab-panel";
import {
  collectionUpdateSchema,
  type Collection,
  type CollectionUpdate,
} from "@/types/collection";
import { isApiError } from "@/utils/api";
import { maxLengthValidator, type MaxLengthValidator } from "@/utils/form";
import { tw } from "@/utils/tailwind";

type Tab = "about" | "sharing" | "homepage";

export type CollectionSavedEvent = CustomEvent<{
  id: string;
}>;

const validateNameMax = maxLengthValidator(50);
const validateCaptionMax = maxLengthValidator(150);

/**
 * @fires btrix-collection-saved CollectionSavedEvent Fires
 */
@customElement("btrix-collection-edit-dialog")
@localized()
export class CollectionEdit extends BtrixElement {
  @property({ type: Object })
  collection?: Collection;

  @property({ type: Boolean })
  open = false;

  @state()
  isDialogVisible = false;

  @state()
  errorTab: Tab | null = null;

  @state()
  dirty = false;

  // Separating this out so that we can eagerly respond to name changes in dialog title & toasts
  @state()
  name = this.collection?.name;

  @property({ type: String })
  tab: Tab = "about";

  @queryAsync("#collectionEditForm")
  private readonly form!: Promise<HTMLFormElement>;

  @query("btrix-markdown-editor")
  private readonly descriptionEditor?: MarkdownEditor | null;

  @query("btrix-collection-share-settings")
  private readonly shareSettings?: CollectionShareSettings;

  private readonly submitTask = new Task(this, {
    task: async (_, { signal }) => {
      if (!this.collection) throw new Error("Collection is undefined");
      try {
        // just push the updated data
        const updates = await this.checkChanged();
        const body = JSON.stringify(updates);
        const path = `/orgs/${this.orgId}/collections/${this.collection.id}`;
        const method = "PATCH";

        const data = await this.api.fetch<{ updated: boolean }>(path, {
          method,
          body,
          signal,
        });

        this.dispatchEvent(
          new CustomEvent("btrix-collection-saved", {
            detail: {
              id: this.collection.id,
            },
          }) as CollectionSavedEvent,
        );
        this.notify.toast({
          message: msg(str`Updated collection “${this.name}”`),
          variant: "success",
          icon: "check2-circle",
          id: "collection-metadata-status",
        });
        return data;
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
        throw e;
      }
    },
    autoRun: false,
  });

  private validate(validator: MaxLengthValidator) {
    return (e: CustomEvent) => {
      const valid = validator.validate(e);
      if (!valid) {
        const el = e.target as HTMLElement;
        this.errorTab = el.closest<TabGroupPanel>("btrix-tab-group-panel")!
          .name as Tab;
      } else {
        this.errorTab = null;
      }
    };
  }

  private async gatherFormData() {
    const form = await this.form;

    if (!this.descriptionEditor?.checkValidity()) {
      this.errorTab = "about";
      void this.descriptionEditor?.focus();
      throw new Error("invalid description");
    }

    const elements = getFormControls(form);
    const invalidElement = elements.find(
      (el) => !(el as HTMLInputElement).checkValidity(),
    );
    if (invalidElement) {
      this.errorTab = invalidElement.closest<TabGroupPanel>(
        "btrix-tab-group-panel",
      )!.name as Tab;
      (invalidElement as HTMLElement).focus();
      throw new Error("invalid form input");
    } else {
      this.errorTab = null;
    }

    const description = this.descriptionEditor.value;

    const { access, allowPublicDownload, defaultThumbnailName } =
      this.shareSettings ?? {};

    const data = {
      ...serialize(form),
      description,
      access,
      allowPublicDownload,
      defaultThumbnailName,
    };
    return collectionUpdateSchema.parse(data);
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    void this.submitTask.run();
  }

  private async hideDialog() {
    void (await this.form).closest<Dialog>("btrix-dialog")!.hide();
  }

  private onReset() {
    void this.hideDialog();
  }

  protected firstUpdated(): void {
    if (this.open) {
      this.isDialogVisible = true;
    }
  }

  render() {
    if (!this.collection) return;
    return html`<btrix-dialog
      label=${msg(str`Edit Collection “${this.name ?? this.collection.name}”`)}
      ?open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-after-hide=${() => (this.isDialogVisible = false)}
      class="[--width:var(--btrix-screen-desktop)]"
    >
      ${this.renderForm()}
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
        ${this.errorTab !== null
          ? html`<span class="text-sm text-danger"
              >${msg("Please review issues with your changes.")}</span
            >`
          : nothing}
        <sl-button
          variant=${this.errorTab === null ? "primary" : "danger"}
          size="small"
          ?loading=${this.submitTask.status === TaskStatus.PENDING}
          ?disabled=${this.submitTask.status === TaskStatus.PENDING ||
          !this.dirty ||
          this.errorTab !== null}
          @click=${async () => {
            // Using submit method instead of type="submit" fixes
            // incorrect getRootNode in Chrome
            const form = await this.form;
            const submitInput = form.querySelector<HTMLInputElement>(
              'input[type="submit"]',
            );
            form.requestSubmit(submitInput);
          }}
          >${msg("Save")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private renderAbout() {
    if (!this.collection) return;
    return html`<btrix-tab-group-panel name="about">
      <sl-input
        class="with-max-help-text part-[input]:text-base part-[input]:font-semibold"
        name="name"
        label=${msg("Name")}
        value=${this.collection.name}
        placeholder=${msg("My Collection")}
        autocomplete="off"
        required
        help-text=${validateNameMax.helpText}
        @sl-input=${(e: CustomEvent) => {
          this.validate(validateNameMax)(e);
          this.name = (e.target as SlInput).value;
        }}
      >
      </sl-input>
      <sl-textarea
        class="with-max-help-text"
        name="caption"
        value=${this.collection.caption ?? ""}
        placeholder=${msg("Summarize the collection's content")}
        autocomplete="off"
        rows="2"
        help-text=${validateCaptionMax.helpText}
        @sl-input=${this.validate(validateCaptionMax)}
      >
        <span slot="label">
          ${msg("Summary")}
          <sl-tooltip>
            <span slot="content">
              ${msg(
                "Write a short description that summarizes this collection. If the collection is public, this description will be visible next to the collection name.",
              )}
            </span>
            <sl-icon
              name="info-circle"
              style="vertical-align: -.175em"
            ></sl-icon>
          </sl-tooltip>
        </span>
      </sl-textarea>
      <btrix-markdown-editor
        class="flex-1"
        .initialValue=${this.collection.description ?? ""}
        placeholder=${msg("Tell viewers about this collection")}
        maxlength=${4000}
        label=${msg("Description")}
      ></btrix-markdown-editor>
    </btrix-tab-group-panel>`;
  }

  private renderSharing() {
    if (!this.collection) return;
    return html`<btrix-tab-group-panel name="sharing">
      <btrix-collection-share-settings
        .collection=${this.collection}
      ></btrix-collection-share-settings>
    </btrix-tab-group-panel>`;
  }

  private renderForm() {
    if (!this.collection) return;
    return html`
      <form
        id="collectionEditForm"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
        @btrix-change=${() => {
          void this.checkChanged();
        }}
        @sl-input=${() => {
          void this.checkChanged();
        }}
        @sl-change=${() => {
          void this.checkChanged();
        }}
      >
        <btrix-tab-group
          placement="top"
          overrideTabLayout=${tw`mb-4 flex gap-2`}
        >
          <btrix-tab-group-tab
            slot="nav"
            panel="about"
            variant=${this.errorTab === "about" ? "error" : "primary"}
          >
            <sl-icon
              name=${this.errorTab === "about"
                ? "exclamation-triangle-fill"
                : "info-square-fill"}
            ></sl-icon>
            ${msg("About")}</btrix-tab-group-tab
          >
          <btrix-tab-group-tab
            slot="nav"
            panel="sharing"
            variant=${this.errorTab === "sharing" ? "error" : "primary"}
          >
            <sl-icon
              name=${this.errorTab === "sharing"
                ? "exclamation-triangle-fill"
                : "box-arrow-up"}
            ></sl-icon>
            ${msg("Sharing")}
          </btrix-tab-group-tab>
          <btrix-tab-group-tab
            slot="nav"
            panel="homepage"
            variant=${this.errorTab === "homepage" ? "error" : "primary"}
          >
            <sl-icon
              name=${this.errorTab === "sharing"
                ? "exclamation-triangle-fill"
                : "house-fill"}
            ></sl-icon>
            ${msg("Homepage")}</btrix-tab-group-tab
          >
          ${this.renderAbout()} ${this.renderSharing()}
          <btrix-tab-group-panel name="homepage"> </btrix-tab-group-panel>
        </btrix-tab-group>
        <input class="offscreen" type="submit" />
      </form>
    `;
  }
  private async checkChanged() {
    try {
      const data = await this.gatherFormData();
      const updates = (
        Object.entries(data) as [
          keyof CollectionUpdate,
          CollectionUpdate[keyof CollectionUpdate],
        ][]
      ).filter(([name, value]) => this.collection?.[name] !== value);
      if (updates.length > 0) {
        this.dirty = true;
      } else {
        this.dirty = false;
      }
      return updates;
    } catch (e) {
      this.dirty = true;
    }
  }
}
