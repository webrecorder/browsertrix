import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { type SlRequestCloseEvent } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";

import checkChanged from "./edit-dialog/helpers/check-changed";
import submitTask from "./edit-dialog/helpers/submit-task";
import { type CollectionShareSettings } from "./edit-dialog/sharing-section";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type TabGroupPanel } from "@/components/ui/tab-group/tab-panel";
import {
  COLLECTION_CAPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  type Collection,
} from "@/types/collection";
import { maxLengthValidator, type MaxLengthValidator } from "@/utils/form";

type Tab = "general" | "sharing";

export type { Tab as EditDialogTab };

export type CollectionSavedEvent = CustomEvent<{
  id: string;
}>;

export const validateNameMax = maxLengthValidator(COLLECTION_NAME_MAX_LENGTH);
export const validateCaptionMax = maxLengthValidator(
  COLLECTION_CAPTION_MAX_LENGTH,
);

/**
 * @fires btrix-collection-saved CollectionSavedEvent Fires
 */
@customElement("btrix-collection-edit-dialog")
@localized()
export class CollectionEdit extends BtrixElement {
  @property({ type: Object })
  collection?: Collection;

  /** For contexts where we don't have the full collection object already -
   * Will cause this to fetch the collection internally, so avoid if there's
   * already a collection object available where this is being used.
   */
  @property({ type: String })
  collectionId?: string;

  @property({ type: Boolean })
  open = false;

  @state()
  isDialogVisible = false;

  @property({ type: String })
  tab: Tab = "general";

  @state()
  errorTab: Tab | null = null;

  @state()
  dirty = false;

  @query("btrix-dialog")
  readonly dialog?: Dialog;

  @queryAsync("#collectionEditForm")
  readonly form!: Promise<HTMLFormElement>;

  @queryAsync("btrix-collection-share-settings")
  readonly shareSettings?: Promise<CollectionShareSettings>;

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("tab")) {
      this.dispatchEvent(
        new CustomEvent("btrix-collection-edit-dialog-tab-change", {
          detail: this.tab,
          bubbles: true,
          composed: true,
        }),
      );
    }
    if (changedProperties.has("collectionId") && this.collectionId) {
      void this.fetchCollection(this.collectionId);
    }
    if (changedProperties.has("collectionId") && !this.collectionId) {
      this.onReset();
      this.collection = undefined;
    }
  }

  readonly checkChanged = checkChanged.bind(this);

  private readonly submitTask = new Task(this, {
    task: submitTask.bind(this)(),
    autoRun: false,
  });

  validate(validator: MaxLengthValidator) {
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

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    await this.submitTask.run();

    this.dirty = false;
    void this.hideDialog();
  }

  private async hideDialog() {
    void this.dialog?.hide();
  }

  private onReset() {
    void this.hideDialog();
    this.dirty = false;
    this.errorTab = null;
  }

  protected firstUpdated(): void {
    if (this.open) {
      this.isDialogVisible = true;
    }
  }

  render() {
    const collection_name = this.collection?.name;

    return html`<btrix-dialog
      .label=${this.collection
        ? msg(str`Share “${collection_name}”`)
        : msg("Share")}
      .open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-after-hide=${() => {
        this.isDialogVisible = false;
        // Reset the open tab when closing the dialog
        this.tab = "general";
      }}
      @sl-request-close=${(e: SlRequestCloseEvent) => {
        if (e.detail.source === "close-button") {
          this.onReset();
          return;
        }
        // Prevent accidental closes unless data has been saved
        // Closing via the close buttons is fine though, cause it resets the form first.
        if (this.dirty) e.preventDefault();
      }}
      class="[--width:40rem]"
      >${this.isDialogVisible
        ? html`
            ${this.collection
              ? html`
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
                    <btrix-collection-share-settings
                      .collection=${this.collection}
                    ></btrix-collection-share-settings>
                    <input class="offscreen" type="submit" />
                  </form>
                `
              : html`
                  <div class="grid h-max min-h-[50svh] place-items-center">
                    <sl-spinner class="text-3xl"></sl-spinner>
                  </div>
                `}
            <div slot="footer" class="flex items-center justify-end gap-3">
              <sl-button
                class="mr-auto"
                size="small"
                @click=${async () => {
                  // Using reset method instead of type="reset" fixes
                  // incorrect getRootNode in Chrome
                  (await this.form).reset();
                }}
                >${this.dirty
                  ? msg("Discard Changes")
                  : msg("Cancel")}</sl-button
              >
              ${this.dirty
                ? html`<span class="text-sm text-warning"
                    >${msg("Unsaved changes.")}</span
                  >`
                : nothing}
              ${this.errorTab !== null
                ? html`<span class="text-sm text-danger"
                    >${msg("Please review issues with your changes.")}</span
                  >`
                : nothing}
              <sl-button
                variant="primary"
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
          `
        : nothing}
    </btrix-dialog>`;
  }

  private async fetchCollection(id: string) {
    try {
      this.collection = await this.getCollection(id);
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve Collection at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-retrieve-status",
      });
    }
  }

  private async getCollection(id: string) {
    const data = await this.api.fetch<Collection>(
      `/orgs/${this.orgId}/collections/${id}/replay.json`,
    );

    return data;
  }
}
