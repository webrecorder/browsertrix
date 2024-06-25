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
  private serverError?: string;

  @state()
  private isFirstOrgAdminJoined = false;

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
        class="flex min-h-full w-full flex-col justify-center gap-12 p-5 md:flex-row md:gap-16 md:py-16"
      >
        <header class="flex-1 pt-6 md:max-w-sm">
          <h1 class="mb-5 text-2xl font-semibold">
            ${msg("You’ve been invited to join an org")}
          </h1>
          ${this.inviteInfo.render({
            complete: (inviteInfo) =>
              renderInviteMessage(inviteInfo, {
                isExistingUser: true,
                isOrgMember: this.isFirstOrgAdminJoined,
              }),
          })}
        </header>

        <div class="max-w-md flex-1">
          <div class="md:rounded-lg md:border md:bg-white md:p-12 md:shadow-lg">
            ${this.inviteInfo.render({
              pending: () => html`
                <div class="flex items-center justify-center text-2xl">
                  <sl-spinner></sl-spinner>
                </div>
              `,
              complete: (inviteInfo) =>
                inviteInfo && this.isFirstOrgAdminJoined
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

  private async onAccept() {
    const inviteInfo = this.inviteInfo.value;

    if (!this.authState || !this.isLoggedIn || !inviteInfo) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    try {
      const data = await this.api.fetch<{ orgName: string; orgSlug: string }>(
        `/orgs/invite-accept/${this.token}`,
        this.authState,
        {
          method: "POST",
        },
      );

      if (inviteInfo.firstOrgAdmin) {
        this.isFirstOrgAdminJoined = true;
      } else {
        this.notify.toast({
          message: msg(
            str`You've joined ${data.orgName || inviteInfo.orgName || msg("Browsertrix")}.`,
          ),
          variant: "success",
          icon: "check2-circle",
        });

        this.navigate.to(`/orgs/${data.orgSlug || inviteInfo.orgSlug}`);
      }
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

  private async onSubmitOrgForm(e: CustomEvent<OrgFormSubmitEventDetail>) {
    const inviteInfo = this.inviteInfo.value;
    if (!inviteInfo) return;

    const { values } = e.detail;
    const { oid, orgName, orgSlug } = inviteInfo;

    if (values.orgName === orgName && values.orgSlug === orgSlug) {
      this.navigate.to(`/orgs/${orgSlug}`);

      return;
    }

    try {
      await this.api.fetch(`/orgs/${oid}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({
          name: values.orgName,
          slug: values.orgSlug,
        }),
      });

      this.notify.toast({
        message: msg("New org name saved."),
        variant: "success",
        icon: "check2-circle",
      });

      await this.dispatchEvent(
        new CustomEvent("btrix-update-user-info", { bubbles: true }),
      );
      const newSlug = values.orgSlug;
      if (newSlug) {
        this.navigate.to(`/orgs/${newSlug}`);
      }
    } catch (e) {
      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg("Sorry, couldn't update organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
