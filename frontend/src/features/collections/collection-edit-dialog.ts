import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { serialize } from "@shoelace-style/shoelace";
import { html } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type MarkdownEditor } from "@/components/ui/markdown-editor";
import { collectionUpdateSchema, type Collection } from "@/types/collection";
import { isApiError } from "@/utils/api";
import { maxLengthValidator } from "@/utils/form";

type Tab = "about" | "sharing" | "homepage";

export type CollectionSavedEvent = CustomEvent<{
  id: string;
}>;

const validateNameMax = maxLengthValidator(50);
const validateCaptionMax = maxLengthValidator(150);

/**
 * @fires btrix-collection-saved CollectionSavedEvent Fires
 */
@customElement("btrix-collection-edit")
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

  @property({ type: String })
  tab: Tab = "about";

  @queryAsync("#collectionForm")
  private readonly form!: Promise<HTMLFormElement>;

  @query("btrix-markdown-editor")
  private readonly descriptionEditor?: MarkdownEditor | null;

  private readonly submitTask = new Task(this, {
    task: async ([update]: readonly [Record<string, unknown>], { signal }) => {
      if (!this.collection) throw new Error("Collection is undefined");
      try {
        const parsedData = collectionUpdateSchema.parse(update);
        const body = JSON.stringify(parsedData);
        const path = `/orgs/${this.orgId}/collections/${this.collection.id}`;
        const method = "PATCH";

        const data = await this.api.fetch<Collection>(path, {
          method,
          body,
          signal,
        });
        this.dispatchEvent(
          new CustomEvent("btrix-collection-saved", {
            detail: {
              id: this.collection.id || data.id,
            },
          }) as CollectionSavedEvent,
        );
        this.notify.toast({
          message: msg(str`"${data.name}" metadata updated`),
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

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target as HTMLFormElement;

    if (!this.descriptionEditor?.checkValidity()) {
      this.errorTab = "about";
      void this.descriptionEditor?.focus();
      return;
    }

    const description = this.descriptionEditor.value;

    const data = { ...serialize(form), description };
    void this.submitTask.run([data]);
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
      label=${msg(str`Edit Collection “${this.collection.name}”`)}
      ?open=${this.open}
      @sl-show=${() => (this.isDialogVisible = true)}
      @sl-after-hide=${() => (this.isDialogVisible = false)}
    >
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
          ?loading=${this.submitTask.status === TaskStatus.PENDING}
          ?disabled=${this.submitTask.status === TaskStatus.PENDING}
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

  private renderForm() {
    if (!this.collection) return;
    return html`
      <form
        id="collectionEditForm"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
      >
        <btrix-tab-group>
          <btrix-tab-group-tab slot="nav" panel="about"
            >${msg("About")}</btrix-tab-group-tab
          >
          <btrix-tab-group-tab slot="nav" panel="sharing"
            >${msg("Sharing")}</btrix-tab-group-tab
          >
          <btrix-tab-group-tab slot="nav" panel="homepage"
            >${msg("Homepage")}</btrix-tab-group-tab
          >
          <btrix-tab-group-panel name="about">
            <sl-input
              class="with-max-help-text"
              name="name"
              label=${msg("Name")}
              value=${this.collection.name}
              placeholder=${msg("My Collection")}
              autocomplete="off"
              required
              help-text=${validateNameMax.helpText}
              @sl-input=${validateNameMax.validate}
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
              @sl-input=${validateCaptionMax.validate}
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
              initialValue=${this.collection.description ?? ""}
              placeholder=${msg("Tell viewers about this collection")}
              maxlength=${4000}
            ></btrix-markdown-editor>
          </btrix-tab-group-panel>
          <btrix-tab-group-panel name="sharing"> </btrix-tab-group-panel>
          <btrix-tab-group-panel name="homepage"> </btrix-tab-group-panel>
        </btrix-tab-group>
        <input class="offscreen" type="submit" />
      </form>
    `;
  }
}
