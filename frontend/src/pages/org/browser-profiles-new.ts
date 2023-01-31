import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { ifDefined } from "lit/directives/if-defined.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-new
 *  authState=${authState}
 *  orgId=${orgId}
 *  browserId=${browserId}
 * ></btrix-browser-profiles-new>
 * ```
 */
@localized()
export class BrowserProfilesNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  browserId!: string;

  @state()
  private isSubmitting = false;

  @state()
  private isDialogVisible = false;

  // URL params can be used to pass name and description
  // base ID determines whether this is an edit/extension
  @state()
  private params: Partial<{
    name: string;
    description: string;
    navigateUrl: string;
    profileId: string | null;
  }> = {};

  firstUpdated() {
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get("profileId");

    this.params = {
      name: params.get("name") || "",
      description: params.get("description") || "",
      navigateUrl: params.get("navigateUrl") || "",
      profileId: profileId || null,
    };
  }

  render() {
    return html`
      <div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${this.params.profileId
            ? `/orgs/${this.orgId}/browser-profiles/profile/${this.params.profileId}`
            : `/orgs/${this.orgId}/browser-profiles`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${this.params.profileId
              ? msg("Back to Profile")
              : msg("Back to Browser Profiles")}</span
          >
        </a>
      </div>

      ${this.params.profileId
        ? html`
            <div class="mb-2">
              <btrix-alert class="text-sm" variant="info"
                >${msg(
                  html`Extending <strong>${this.params.name}</strong>`
                )}</btrix-alert
              >
            </div>
          `
        : ""}

      <div class="h-screen flex flex-col">
        <div
          class="flex-0 flex items-center justify-between mb-3 p-2 bg-slate-50"
        >
          <p class="text-sm text-slate-600 mr-3 p-1">
            ${msg(
              "Interact with the browsing tool to record your browser profile. You will complete and save your profile in the next step."
            )}
          </p>

          <sl-button
            variant="primary"
            @click=${() => (this.isDialogVisible = true)}
          >
            ${msg("Next")}
          </sl-button>
        </div>

        <btrix-profile-browser
          class="flex-1 border rounded-lg overflow-hidden"
          .authState=${this.authState}
          orgId=${this.orgId}
          browserId=${this.browserId}
          initialNavigateUrl=${ifDefined(this.params.navigateUrl)}
        ></btrix-profile-browser>
      </div>

      <sl-dialog
        label=${msg(str`Save Browser Profile`)}
        ?open=${this.isDialogVisible}
        @sl-request-close=${() => (this.isDialogVisible = false)}
      >
        ${this.renderForm()}
      </sl-dialog>
    `;
  }

  private renderForm() {
    return html`<form @submit=${this.onSubmit}>
      <div class="grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          placeholder=${msg("Example (example.com)", {
            desc: "Example browser profile name",
          })}
          autocomplete="off"
          value=${this.params.profileId && this.params.name
            ? msg(str`${this.params.name} Copy`)
            : this.params.name || msg("My Profile")}
          required
        ></sl-input>

        <sl-textarea
          name="description"
          label=${msg("Description")}
          help-text=${msg("Optional profile description")}
          placeholder=${msg("Example (example.com) login profile", {
            desc: "Example browser profile name",
          })}
          rows="2"
          autocomplete="off"
          value=${this.params.description || ""}
        ></sl-textarea>

        <div class="text-right">
          <sl-button
            variant="text"
            @click=${() => (this.isDialogVisible = false)}
          >
            ${msg("Back")}
          </sl-button>

          <sl-button
            variant="primary"
            type="submit"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Create Profile")}
          </sl-button>
        </div>
      </div>
    </form>`;
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const params = {
      browserid: this.browserId,
      name: formData.get("name"),
      description: formData.get("description"),
    };

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/profiles`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      this.notify({
        message: msg("Successfully created browser profile."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(`/orgs/${this.orgId}/browser-profiles/profile/${data.id}`);
    } catch (e) {
      this.isSubmitting = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}

customElements.define("btrix-browser-profiles-new", BrowserProfilesNew);
