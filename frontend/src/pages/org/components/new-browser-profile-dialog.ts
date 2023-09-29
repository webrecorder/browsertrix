import { state, property, queryAsync } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";

import type { AuthState } from "../../../utils/AuthService";
import LiteElement, { html } from "../../../utils/LiteElement";
import type { Dialog } from "../../../components/dialog";

@localized()
export class NewBrowserProfileDialog extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @queryAsync("#browserProfileForm")
  private form!: Promise<HTMLFormElement>;

  render() {
    return html` <btrix-dialog
      label=${msg(str`Create a New Browser Profile`)}
      ?open=${this.open}
      @sl-initial-focus=${async (e: CustomEvent) => {
        const nameInput = (await this.form).querySelector(
          'sl-input[name="url"]'
        ) as SlInput;
        if (nameInput) {
          e.preventDefault();
          nameInput.focus();
        }
      }}
    >
      <form
        id="browserProfileForm"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
      >
        <div class="grid gap-5">
          <div>
            <label
              id="startingUrlLabel"
              class="text-sm leading-normal"
              style="margin-bottom: var(--sl-spacing-3x-small)"
              >${msg("Starting URL")}
            </label>

            <div class="flex">
              <sl-select
                class="grow-0 mr-1"
                name="urlPrefix"
                value="https://"
                hoist
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
              >
                <sl-option value="http://">http://</sl-option>
                <sl-option value="https://">https://</sl-option>
              </sl-select>
              <sl-input
                class="grow"
                name="url"
                placeholder=${msg("example.com")}
                autocomplete="off"
                aria-labelledby="startingUrlLabel"
                required
              >
              </sl-input>
            </div>
          </div>
        </div>
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
          >${msg("Start Profile Creator")}</sl-button
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
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const url = formData.get("url") as string;

    try {
      const data = await this.createBrowser({
        url: `${formData.get("urlPrefix")}${url.substring(
          url.indexOf(",") + 1
        )}`,
      });

      this.notify({
        message: msg("Starting up browser for profile creation."),
        variant: "success",
        icon: "check2-circle",
      });
      await this.hideDialog();
      this.navTo(
        `/orgs/${this.orgId}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          "My Profile"
        )}&description=&profileId=`
      );
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
    this.isSubmitting = false;
  }

  private createBrowser({ url }: { url: string }) {
    const params = {
      url,
    };

    return this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
customElements.define(
  "btrix-new-browser-profile-dialog",
  NewBrowserProfileDialog
);
