import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { renderInviteMessage } from "./ui/inviteMessage";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { OrgFormSubmitEventDetail } from "@/features/accounts/org-form";
import { ROUTES } from "@/routes";
import type { UserOrgInviteInfo } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { Auth, AuthState } from "@/utils/AuthService";

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
  private readonly inviteInfo = new Task(this, {
    task: async ([authState, token]) => {
      if (!authState) return;
      if (!token) throw new Error("Missing args");
      const inviteInfo = await this.getInviteInfo({ token, auth: authState });
      return inviteInfo;
    },
    args: () => [this.authState, this.token] as const,
  });

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

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
    if (!this.isLoggedIn) {
      this.notify.toast({
        message: msg("Log in to continue."),
        variant: "success",
        icon: "check2-circle",
        duration: Infinity,
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
      <section
        class="flex w-full flex-col justify-center gap-12 p-5 md:flex-row md:gap-16"
      >
        <header class="my-12 max-w-sm flex-1">
          <div class="md:sticky md:top-12">
            <h1 class="sticky top-0 mb-5 text-xl font-semibold">
              ${msg("You’ve been invited to join an org")}
            </h1>
            ${this.inviteInfo.render({
              complete: (inviteInfo) =>
                renderInviteMessage(inviteInfo, {
                  isExistingUser: true,
                  isLoggedIn: this.isLoggedIn,
                }),
            })}
          </div>
        </header>

        <div
          class="flex max-w-md flex-1 items-center justify-center md:rounded-lg md:border md:bg-white md:p-12 md:shadow-lg"
        >
          ${this.inviteInfo.render({
            pending: () => html`
              <div class="flex items-center justify-center text-2xl">
                <sl-spinner></sl-spinner>
              </div>
            `,
            complete: (inviteInfo) =>
              this.isLoggedIn && inviteInfo && inviteInfo.firstOrgAdmin
                ? html`
                    <btrix-org-form
                      name=${inviteInfo.orgName || ""}
                      slug=${inviteInfo.orgSlug || ""}
                      @btrix-submit=${this.onSubmitOrgForm}
                    ></btrix-org-form>
                  `
                : html`
                    <div class="w-full text-center">
                      <sl-button
                        class="my-3 block"
                        variant="primary"
                        @click=${this.onAccept}
                      >
                        ${msg("Accept Invitation")}
                      </sl-button>
                      <sl-button variant="text" @click=${this.onDecline}
                        >${msg("Decline")}</sl-button
                      >
                    </div>
                  `,
            error: (err) =>
              html`<btrix-alert variant="danger">${err}</btrix-alert>`,
          })}
        </div>
      </section>
    `;
  }

  private async getInviteInfo({
    auth,
    token,
  }: {
    auth: Auth;
    token: string;
  }): Promise<UserOrgInviteInfo | void> {
    try {
      return await this.api.fetch<UserOrgInviteInfo>(
        `/users/me/invite/${token}`,
        auth,
      );
    } catch (e) {
      console.debug(e);
      throw new Error(msg("This invitation is not valid."));
    }
  }

  private async onAccept(params?: OrgFormSubmitEventDetail["values"]) {
    if (!this.authState || !this.isLoggedIn || !this.inviteInfo.value) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    let { orgName, orgSlug } = this.inviteInfo.value;
    if (params) {
      if (params.orgName) {
        orgName = params.orgName;
      }
      if (params.orgSlug) {
        orgSlug = params.orgSlug;
      }
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
        message: msg(str`You've joined ${orgName || msg("Browsertrix")}.`),
        variant: "success",
        icon: "check2-circle",
      });

      this.navigate.to(`/orgs/${orgSlug}`);
    } catch (err) {
      if (isApiError(err) && err.message === "Invalid Invite Code") {
        this.serverError = msg("This invitation is not valid");
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }
  }

  private onDecline() {
    const { orgName } = this.inviteInfo.value || {};

    this.notify.toast({
      message: msg(
        str`You've declined to join ${orgName || msg("Browsertrix")}.`,
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
