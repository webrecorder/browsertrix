import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { AccessCode } from "../utils/orgs";

@localized()
export class OrgInviteForm extends LiteElement {
  @property({ type: String })
  orgId?: string;

  @property({ type: Object })
  authState?: AuthState;

  @state()
  private isSubmitting: boolean = false;

  @state()
  private serverError?: string;

  render() {
    let formError;

    if (this.serverError) {
      formError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <form
        class="max-w-md"
        @submit=${this.onSubmit}
        aria-describedby="formError"
      >
        <div class="mb-5">
          <sl-input
            id="inviteEmail"
            name="inviteEmail"
            type="email"
            label=${msg("Email")}
            placeholder=${msg("team-member@email.com", {
              desc: "Placeholder text for email to invite",
            })}
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-radio-group
            name="role"
            label="Select an option"
            value=${AccessCode.viewer}
          >
            <sl-radio value=${AccessCode.owner}>
              ${msg("Admin")} - ${msg("Can manage crawls and invite others")}
            </sl-radio>
            <sl-radio value=${AccessCode.crawler}>
              ${msg("Crawler")} - ${msg("Can manage crawls")}
            </sl-radio>
            <sl-radio value=${AccessCode.viewer}>
              ${msg("Viewer")} - ${msg("Can view crawls")}
            </sl-radio>
          </sl-radio-group>
        </div>

        ${formError}

        <div>
          <sl-button
            variant="primary"
            type="submit"
            ?loading=${this.isSubmitting}
            ?disabled=${this.isSubmitting}
            >${msg("Invite")}</sl-button
          >
          <sl-button
            variant="text"
            @click=${() => this.dispatchEvent(new CustomEvent("cancel"))}
            >${msg("Cancel")}</sl-button
          >
        </div>
      </form>
    `;
  }

  async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!this.authState) return;

    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const inviteEmail = formData.get("inviteEmail") as string;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/invite`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: Number(formData.get("role")),
          }),
        }
      );

      this.dispatchEvent(
        new CustomEvent("success", {
          detail: {
            inviteEmail,
            isExistingUser: data.invited === "existing_user",
          },
        })
      );
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }
}
