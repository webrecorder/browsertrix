import { localized, msg } from "@lit/localize";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import AuthService, { type LoggedInEventDetail } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

type InviteResponseData = {
  inviterEmail: string;
  inviterName: string;
  orgName: string;
  orgSlug: string;
  firstOrgAdmin: boolean;
  orgNameRequired: boolean;
};

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
  private inviteInfo?: InviteResponseData;

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

  firstUpdated() {
    void this.getInviteInfo();
  }

  render() {
    if (this.serverError) {
      return html`<btrix-alert variant="danger"
        >${this.serverError}</btrix-alert
      >`;
    }

    const hasInviteInfo = Boolean(this.inviteInfo?.inviterEmail);
    const placeholder = html`<span
      class="inline-block rounded-full bg-gray-100"
      style="width: 6em"
      >&nbsp;</span
    >`;

    return html`
      <article class="flex w-full flex-col justify-center p-5 md:flex-row">
        <div class="max-w-sm md:mr-12 md:mt-12">
          <p class="mb-5 text-xl font-semibold md:text-2xl">
            ${msg("Welcome to Browsertrix.")}
          </p>
          ${when(
            this.inviteInfo,
            (inviteInfo) => html`
              <p class="text-neutral-600">
                ${inviteInfo.firstOrgAdmin
                  ? msg("TODO")
                  : msg(
                      html`You’ve been invited by
                        ${inviteInfo.inviterName ||
                        inviteInfo.inviterEmail ||
                        placeholder}
                        to join
                        <span class="break-words text-primary"
                          >${hasInviteInfo
                            ? inviteInfo.orgName || msg("Browsertrix")
                            : placeholder}</span
                        >.`,
                    )}
              </p>
            `,
          )}
        </div>

        <main
          class="max-w-md md:rounded-lg md:border md:bg-white md:p-10 md:shadow-lg"
        >
          <btrix-sign-up-form
            email=${this.email!}
            inviteToken=${this.token!}
            ?isOrgInvite=${Boolean(
              this.inviteInfo?.firstOrgAdmin || this.inviteInfo?.orgName,
            )}
            @authenticated=${this.onAuthenticated}
          ></btrix-sign-up-form>
        </main>
      </article>
    `;
  }

  private async getInviteInfo() {
    const resp = await fetch(
      `/api/users/invite/${this.token}?email=${encodeURIComponent(this.email!)}`,
    );

    if (resp.status === 200) {
      this.inviteInfo = await resp.json();
      // TEMP test data
      this.inviteInfo = {
        ...this.inviteInfo!,
        firstOrgAdmin: true,
        orgNameRequired: false,
      };
    } else if (resp.status === 404) {
      this.serverError = msg(
        "This invite doesn't exist or has expired. Please ask the organization administrator to resend an invitation.",
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
      }),
    );
  }
}
