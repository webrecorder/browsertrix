import { localized, msg } from "@lit/localize";
import { type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { UserOrgInviteInfo } from "@/types/user";
import AuthService, { type LoggedInEventDetail } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

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
  private inviteInfo?: UserOrgInviteInfo;

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

    return html`
      <article
        class="flex w-full flex-col justify-center gap-12 p-5 md:flex-row md:gap-16"
      >
        <header class="mt-12 max-w-sm">
          <div class="md:sticky md:top-12">
            <h1 class="sticky top-0 mb-5 text-xl font-semibold">
              ${msg("Create your Browsertrix account")}
            </h1>
            ${this.renderWelcomeMessage()}
          </div>
        </header>

        <main
          class="max-w-md md:rounded-lg md:border md:bg-white md:p-12 md:shadow-lg"
        >
          <h1></h1>
          <btrix-sign-up-form
            email=${this.email!}
            inviteToken=${this.token!}
            .inviteInfo=${this.inviteInfo}
            @authenticated=${this.onAuthenticated}
          ></btrix-sign-up-form>
        </main>
      </article>
    `;
  }

  private renderWelcomeMessage() {
    if (!this.inviteInfo) return;

    let message: string | TemplateResult = "";

    if (this.inviteInfo.firstOrgAdmin && this.inviteInfo.orgNameRequired) {
      message = msg("Register your organization and user account.");
    } else if (this.inviteInfo.inviterName && this.inviteInfo.orgName) {
      message = msg(
        html`You’ve been invited by
          <strong class="font-medium">${this.inviteInfo.inviterName}</strong>
          to join the organization
          <span class="font-medium text-primary">
            ${this.inviteInfo.orgName}
          </span>
          on Browsertrix.`,
      );
    } else if (this.inviteInfo.orgName) {
      message = msg(
        html`Register your user account for the organization
          <span class="font-medium text-primary">
            ${this.inviteInfo.orgName}
          </span>
          on Browsertrix.`,
      );
    }

    if (!message) return;

    return html` <p class="max-w-prose text-neutral-600">${message}</p> `;
  }

  private async getInviteInfo() {
    const resp = await fetch(
      `/api/users/invite/${this.token}?email=${encodeURIComponent(this.email!)}`,
    );

    if (resp.status === 200) {
      // this.inviteInfo = await resp.json();
      // TEMP test data
      this.inviteInfo = {
        ...this.inviteInfo!,
        firstOrgAdmin: true,
        orgName: "TEMP TEST ORG",
        orgSlug: "temp-test-org",
        orgNameRequired: true,
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
