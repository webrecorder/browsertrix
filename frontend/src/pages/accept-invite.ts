import { localized, msg, str } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { OrgFormSubmitEventDetail } from "@/features/accounts/org-form";
import { ROUTES } from "@/routes";
import type { UserOrgInviteInfo } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";

@localized()
@customElement("btrix-accept-invite")
export class AcceptInvite extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  serverError?: string;

  @state()
  private inviteInfo?: UserOrgInviteInfo;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

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

  private get isLoggedIn(): boolean {
    return Boolean(
      this.authState && this.email && this.authState.username === this.email,
    );
  }

  firstUpdated() {
    if (this.isLoggedIn) {
      void this.getInviteInfo();
    } else {
      this.notify.toast({
        message: msg("Log in to continue."),
        variant: "success",
        icon: "check2-circle",
        duration: 10000,
      });

      this.navigate.to(
        `/log-in?redirectUrl=${encodeURIComponent(
          `${window.location.pathname}${window.location.search}`,
        )}`,
      );
    }
  }

  render() {
    if (this.serverError) {
      return html`
        <div class="mb-12">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <article
        class="flex w-full flex-col justify-center gap-12 p-5 md:flex-row md:gap-16"
      >
        <header class="my-12 max-w-sm flex-1">
          <div class="md:sticky md:top-12">
            <h1 class="sticky top-0 mb-5 text-xl font-semibold">
              ${msg("Welcome to Browsertrix")}
            </h1>
            ${this.renderInviteMessage()}
          </div>
        </header>

        <main
          class="flex max-w-md flex-1 items-center justify-center md:rounded-lg md:border md:bg-white md:p-12 md:shadow-lg"
        >
          ${when(
            this.orgNameRequired,
            () => html`
              <btrix-org-form
                .inviteInfo=${this.inviteInfo}
                @btrix-submit=${this.onSubmitOrgForm}
              ></btrix-org-form>
            `,
            () => html`
              <div class="w-full text-center">
                <sl-button
                  class="my-3 block"
                  variant="primary"
                  @click=${this.onAccept}
                >
                  ${msg("Accept invitation")}
                </sl-button>
                <sl-button variant="text" @click=${this.onDecline}
                  >${msg("Decline")}</sl-button
                >
              </div>
            `,
          )}
        </main>
      </article>
    `;
  }

  private renderInviteMessage() {
    if (!this.inviteInfo) return;

    let message: string | TemplateResult = "";

    if (this.inviteInfo.firstOrgAdmin && this.inviteInfo.orgNameRequired) {
      message = msg("Register your organization to start web archiving.");
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
        html`You’ve been invited to join the organization
          <span class="font-medium text-primary">
            ${this.inviteInfo.orgName}</span
          >.`,
      );
    }

    if (!message) return;

    return html` <p class="max-w-prose text-neutral-600">${message}</p> `;
  }

  private async getInviteInfo() {
    if (!this.authState) return;

    try {
      // this.inviteInfo = await this.apiFetch<UserOrgInviteInfo>(
      //   `/users/me/invite/${this.token}`,
      //   this.authState,
      // );

      // TEMP test data
      this.inviteInfo = {
        ...this.inviteInfo!,
        firstOrgAdmin: true,
        orgName: "TEMP TEST ORG",
        orgSlug: "temp-test-org",
        orgNameRequired: true,
      };
    } catch {
      this.serverError = msg("This invitation is not valid");
    }
  }

  private async onAccept(params?: OrgFormSubmitEventDetail["values"]) {
    if (!this.authState || !this.isLoggedIn) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    try {
      await this.api.fetch(
        `/orgs/invite-accept/${this.token}`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify(params || {}),
        },
      );

      // TODO handle new org name
      this.notify.toast({
        message: msg(
          str`You've joined ${this.inviteInfo?.orgName || msg("Browsertrix")}.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.navigate.to(ROUTES.home);
    } catch (err) {
      if (isApiError(err) && err.message === "Invalid Invite Code") {
        this.serverError = msg("This invitation is not valid");
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }
  }

  private onDecline() {
    // TODO handle new org name
    this.notify.toast({
      message: msg(
        str`You've declined to join ${this.inviteInfo?.orgName || msg("Browsertrix")}.`,
      ),
      variant: "info",
      icon: "info-circle",
    });

    this.navigate.to(ROUTES.home);
  }

  private onSubmitOrgForm(e: CustomEvent<OrgFormSubmitEventDetail>) {
    const { values } = e.detail;

    void this.onAccept(values);
  }
}
