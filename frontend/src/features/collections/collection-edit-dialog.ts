import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { type SlRequestCloseEvent } from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";

import renderAbout from "./edit-dialog/about-section";
import checkChanged from "./edit-dialog/helpers/check-changed";
import submitTask from "./edit-dialog/helpers/submit-task";
import { type CollectionHomepageSettings } from "./edit-dialog/homepage-section";
import { type CollectionShareSettings } from "./edit-dialog/sharing-section";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type MarkdownEditor } from "@/components/ui/markdown-editor";
import { type TabGroupPanel } from "@/components/ui/tab-group/tab-panel";
import { type Collection } from "@/types/collection";
import { maxLengthValidator, type MaxLengthValidator } from "@/utils/form";
import { tw } from "@/utils/tailwind";

export type Tab = "about" | "sharing" | "homepage";

export type CollectionSavedEvent = CustomEvent<{
  id: string;
}>;

export const validateNameMax = maxLengthValidator(50);
export const validateCaptionMax = maxLengthValidator(150);

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

  @property({ type: String })
  homePageId?: string | null = null;

  @property({ type: Boolean })
  replayLoaded = false;

  @state()
  isDialogVisible = false;

  @property({ type: String })
  tab: Tab = "about";

  @state()
  errorTab: Tab | null = null;

  @state()
  dirty = false;

  // Separating this out so that we can eagerly respond to name changes in dialog title & toasts
  @state()
  name = this.collection?.name;

  @queryAsync("#collectionEditForm")
  readonly form!: Promise<HTMLFormElement>;

  @query("btrix-markdown-editor")
  readonly descriptionEditor?: MarkdownEditor | null;

  @query("btrix-collection-share-settings")
  readonly shareSettings?: CollectionShareSettings;

  @query("btrix-collection-homepage-settings")
  readonly homepageSettings?: CollectionHomepageSettings;

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
      .label=${msg(str`Edit Collection “${this.name || this.collection.name}”`)}
      .open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-after-hide=${() => (this.isDialogVisible = false)}
      @sl-request-close=${(e: SlRequestCloseEvent) => {
        // Prevent accidental closes unless data has been saved
        // Closing via the close buttons is fine though, cause it resets the form first.
        if (this.dirty) e.preventDefault();
        // Reset the open tab when closing the dialog
        this.tab = "about";
      }}
      class="h-full [--width:var(--btrix-screen-desktop)]"
    >
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
          active=${this.tab}
          @btrix-tab-change=${(e: CustomEvent<Tab>) => {
            this.tab = e.detail;
          }}
        >
          ${this.renderTab({
            panel: "about",
            icon: "info-square-fill",
            string: msg("About"),
          })}
          ${this.renderTab({
            panel: "sharing",
            icon: "box-arrow-up",
            string: msg("Sharing"),
          })}
          ${this.renderTab({
            panel: "homepage",
            icon: "house-fill",
            string: msg("Homepage"),
          })}

          <btrix-tab-group-panel name="about">
            ${renderAbout.bind(this)()}
          </btrix-tab-group-panel>

          <btrix-tab-group-panel name="sharing">
            <btrix-collection-share-settings
              .collection=${this.collection}
            ></btrix-collection-share-settings>
          </btrix-tab-group-panel>

          <btrix-tab-group-panel name="homepage">
            <btrix-collection-homepage-settings
              .collectionId=${this.collection.id}
              .homeUrl=${this.collection.homeUrl}
              .homePageId=${this.collection.homeUrlPageId}
              .homeTs=${this.collection.homeUrlTs}
              .replayLoaded=${this.replayLoaded}
            ></btrix-collection-homepage-settings>
          </btrix-tab-group-panel>
        </btrix-tab-group>
        <input class="offscreen" type="submit" />
      </form>
      <div slot="footer" class="flex items-center justify-end gap-3">
        <sl-button
          class="mr-auto"
          size="small"
          @click=${async () => {
            // Using reset method instead of type="reset" fixes
            // incorrect getRootNode in Chrome
            (await this.form).reset();
          }}
          >${this.dirty ? msg("Discard Changes") : msg("Cancel")}</sl-button
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
    </btrix-dialog>`;
  }

  private renderTab({
    panel,
    icon,
    string,
  }: {
    panel: Tab;
    icon: string;
    string: string;
  }) {
    return html`<btrix-tab-group-tab
      slot="nav"
      panel=${panel}
      variant=${this.errorTab === panel ? "error" : "primary"}
    >
      <sl-icon
        name=${this.errorTab === panel ? "exclamation-triangle-fill" : icon}
      ></sl-icon>
      ${string}
    </btrix-tab-group-tab>`;
  }
}
