import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";

/**
 * @event success
 */
@localized()
export class InviteForm extends LiteElement {
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
            placeholder=${msg("person@email.com", {
              desc: "Placeholder text for email to invite",
            })}
            required
          >
          </sl-input>
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
        </div>
      </sl-form>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    this.serverError = undefined;
    this.isSubmitting = true;

    const { formData } = event.detail;
    const inviteEmail = formData.get("inviteEmail") as string;

    try {
      const data = await this.apiFetch(`/users/invite`, this.authState, {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
        }),
      });

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
