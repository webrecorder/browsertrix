import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { AccessCode } from "../utils/archives";

@localized()
export class ArchiveInviteForm extends LiteElement {
  @property({ type: String })
  archiveId?: string;

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
          <btrix-alert id="formError" type="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <sl-form
        class="max-w-md"
        @sl-submit=${this.onSubmit}
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
          <sl-radio-group label="Select an option">
            <sl-radio name="role" value=${AccessCode.owner} checked>
              ${msg("Admin")}
              <span class="text-gray-500">
                - ${msg("Can manage crawls and invite others")}</span
              >
            </sl-radio>
          </sl-radio-group>
        </div>

        ${formError}

        <div>
          <sl-button
            type="primary"
            submit
            ?loading=${this.isSubmitting}
            ?disabled=${this.isSubmitting}
            >${msg("Invite")}</sl-button
          >
          <sl-button
            type="text"
            @click=${() => this.dispatchEvent(new CustomEvent("cancel"))}
            >${msg("Cancel")}</sl-button
          >
        </div>
      </sl-form>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    this.isSubmitting = true;

    const { formData } = event.detail;
    const inviteEmail = formData.get("inviteEmail") as string;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/invite`,
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
