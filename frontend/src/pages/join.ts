import { localized, msg } from "@lit/localize";
import { type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { OrgFormSubmitEventDetail } from "@/features/accounts/org-form";
import type { CurrentUser, UserOrgInviteInfo } from "@/types/user";
import { isApiError } from "@/utils/api";
import AuthService, {
  type AuthState,
  type LoggedInEventDetail,
} from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

/**
 * @fires btrix-update-user-info
 */
@localized()
@customElement("btrix-join")
export class Join extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  private serverError?: string;

  @state()
  private inviteInfo?: UserOrgInviteInfo;

  private get orgNameRequired() {
    if (!this.inviteInfo) return null;

    return Boolean(
      this.inviteInfo.firstOrgAdmin && this.inviteInfo.orgNameRequired,
    );
  }

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

    // const isRegistered =
    //   this.authState && this.authState.username === this.email;

    const isRegistered = Boolean(this.authState);

    return html`
      <article
        class="flex w-full flex-col justify-center gap-12 p-5 md:flex-row md:gap-16"
      >
        <header class="my-12 max-w-sm flex-1">
          <div class="md:sticky md:top-12">
            <h1 class="sticky top-0 mb-5 text-xl font-semibold">
              ${msg("Set up your Browsertrix account")}
            </h1>
            ${this.renderInviteMessage()}
          </div>
        </header>

        <main
          class="max-w-md flex-1 md:rounded-lg md:border md:bg-white md:p-12 md:shadow-lg"
        >
          ${when(
            isRegistered,
            () => html`
              <btrix-org-form
                .inviteInfo=${this.inviteInfo}
                @btrix-submit=${this.onSubmitOrgForm}
              ></btrix-org-form>
            `,
            () => html`
              <btrix-sign-up-form
                email=${this.email!}
                inviteToken=${this.token!}
                .inviteInfo=${this.inviteInfo}
                @authenticated=${this.onAuthenticated}
              ></btrix-sign-up-form>
            `,
          )}
        </main>
      </article>
    `;
  }

  private renderInviteMessage() {
    if (!this.inviteInfo) return;

    let message: string | TemplateResult = "";

    if (this.orgNameRequired) {
      message = msg(
        "You're almost there! Register your account and organization to start web archiving.",
      );
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
      this.inviteInfo = await resp.json();
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
        api: Boolean(this.orgNameRequired),
      }),
    );
  }

  private async onSubmitOrgForm(e: CustomEvent<OrgFormSubmitEventDetail>) {
    if (!this.userInfo) {
      console.debug("missing user info");
      return;
    }

    const org = this.userInfo.orgs[0];
    const { values } = e.detail;

    try {
      await this.apiFetch(`/orgs/${org.id}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({
          name: values.orgName,
          slug: values.orgSlug,
        }),
      });

      this.notify({
        message: msg("Updated organization."),
        variant: "success",
        icon: "check2-circle",
      });

      await this.dispatchEvent(
        new CustomEvent("btrix-update-user-info", { bubbles: true }),
      );
      const newSlug = values.orgSlug;
      if (newSlug) {
        this.navTo(`/orgs/${newSlug}`);
      }
    } catch (e) {
      this.notify({
        message: isApiError(e)
          ? e.message
          : msg("Sorry, couldn't update organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
