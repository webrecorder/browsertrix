import { state, property, queryAsync } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";

import { maxLengthValidator } from "../../../utils/form";
import type { AuthState } from "../../../utils/AuthService";
import LiteElement, { html } from "../../../utils/LiteElement";
import type { Dialog } from "../../../components/dialog";

@localized()
export class NewCollectionDialog extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @queryAsync("#collectionForm")
  private form!: Promise<HTMLFormElement>;

  private validateNameMax = maxLengthValidator(50);

  render() {
    return html` <btrix-dialog
      label=${msg(str`New Collection`)}
      ?open=${this.open}
      @sl-initial-focus=${async (e: CustomEvent) => {
        const nameInput = (await this.form).querySelector(
          'sl-input[name="name"]'
        ) as SlInput;
        if (nameInput) {
          e.preventDefault();
          nameInput.focus();
        }
      }}
    >
      <form id="collectionForm" @reset=${this.onReset} @submit=${this.onSubmit}>
        <p class="text-neutral-500 max-w-prose mb-5">
          ${msg(
            "Choose a unique name for your collection. You can change it before saving the collection."
          )}
        </p>
        <sl-input
          class="with-max-help-text"
          name="name"
          label=${msg("Collection Name")}
          placeholder=${msg("My Collection")}
          autocomplete="off"
          required
          help-text=${this.validateNameMax.helpText}
          @sl-input=${this.validateNameMax.validate}
        ></sl-input>

        <input class="invisible h-0 w-0" type="submit" />
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button
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
            const submitInput = form.querySelector(
              'input[type="submit"]'
            ) as HTMLInputElement;
            form.requestSubmit(submitInput);
          }}
          >${msg("Continue")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private async hideDialog() {
    ((await this.form).closest("btrix-dialog") as Dialog).hide();
  }

  private onReset() {
    this.hideDialog();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector('sl-input[name="name"]') as SlInput;
    if (!nameInput.checkValidity()) {
      return;
    }

    const { name } = serialize(form);

    this.hideDialog();
    this.navTo(`/orgs/${this.orgId}/collections/new?name=${name}#crawls`);
  }
}
customElements.define("btrix-new-collection-dialog", NewCollectionDialog);
