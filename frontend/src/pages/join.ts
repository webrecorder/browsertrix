import { state, property, customElement } from "lit/decorators.js";
import { msg, str, localized } from "@lit/localize";

import LiteElement, { html } from "@/utils/LiteElement";
import type { LoggedInEventDetail } from "@/utils/AuthService";
import AuthService from "@/utils/AuthService";

@localized()
@customElement("btrix-join")
export class Join extends LiteElement {
  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  private serverError?: string;

  @state()
  private inviteInfo: {
    inviterEmail: string;
    inviterName: string;
    orgName: string;
  } = {
    inviterEmail: "",
    inviterName: "",
    orgName: "",
  };

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

  firstUpdated() {
    this.getInviteInfo();
  }

  render() {
    if (this.serverError) {
      return html`<btrix-alert variant="danger"
        >${this.serverError}</btrix-alert
      >`;
    }

    const hasInviteInfo = Boolean(this.inviteInfo.inviterEmail);
    const placeholder = html`<span
      class="inline-block bg-gray-100 rounded-full"
      style="width: 6em"
      >&nbsp;</span
    >`;

    return html`
      <article class="w-full p-5 flex flex-col md:flex-row justify-center">
        <div class="max-w-sm md:mt-12 md:mr-12">
          <div class="mb-3 text-gray-500">
            ${msg(
              str`Invited by ${
                this.inviteInfo.inviterName ||
                this.inviteInfo.inviterEmail ||
                placeholder
              }`
            )}
          </div>
          <p class="text-xl md:text-2xl font-semibold mb-5">
            ${msg(
              html`You’ve been invited to join
                <span class="text-primary break-words"
                  >${hasInviteInfo
                    ? this.inviteInfo.orgName || msg("Browsertrix Cloud")
                    : placeholder}</span
                >.`
            )}
          </p>
        </div>

        <main
          class="max-w-md md:bg-white md:border md:shadow-lg md:rounded-lg md:p-10"
        >
          <btrix-sign-up-form
            email=${this.email!}
            inviteToken=${this.token!}
            @authenticated=${this.onAuthenticated}
          ></btrix-sign-up-form>
        </main>
      </article>
    `;
  }

  private async getInviteInfo() {
    const resp = await fetch(
      `/api/users/invite/${this.token}?email=${encodeURIComponent(this.email!)}`
    );

    if (resp.status === 200) {
      const body = await resp.json();

      this.inviteInfo = {
        inviterEmail: body.inviterEmail,
        inviterName: body.inviterName,
        orgName: body.orgName,
      };
    } else if (resp.status === 404) {
      this.serverError = msg(
        "This invite doesn't exist or has expired. Please ask the organization administrator to resend an invitation."
      );
    } else {
      this.serverError = msg("This invitation is not valid");
    }
  }

  private onAuthenticated(event: CustomEvent<LoggedInEventDetail>) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        // TODO separate logic for confirmation message
        // firstLogin: true,
      })
    );
  }
}
