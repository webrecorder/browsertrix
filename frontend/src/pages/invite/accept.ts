import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { renderInviteMessage } from "./ui/inviteMessage";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { APIUser } from "@/index";
import type { OrgUpdatedDetail } from "@/pages/invite/ui/org-form";
import { ROUTES } from "@/routes";
import type { UserOrg, UserOrgInviteInfo } from "@/types/user";
import { isApiError } from "@/utils/api";
import appState, { AppStateService, use } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

import "./ui/org-form";

@localized()
@customElement("btrix-accept-invite")
export class AcceptInvite extends TailwindElement {
  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @use()
  appState = appState;

  @state()
  private serverError?: string;

  @state()
  _firstAdminOrgInfo: null | Pick<UserOrg, "id" | "name" | "slug"> = null;

  private get authState() {
    return this.appState.auth;
  }

  readonly inviteInfo = new Task(this, {
    autoRun: false,
    task: async ([token]) => {
      if (!token) throw new Error("Missing args");
      const inviteInfo = await this._getInviteInfo(token);
      return inviteInfo;
    },
    args: () => [this.token] as const,
  });

  get _isLoggedIn(): boolean {
    return Boolean(this.authState && this.email);
  }

  readonly _api = new APIController(this);
  readonly _navigate = new NavigateController(this);
  readonly _notify = new NotifyController(this);

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

  firstUpdated() {
    if (this._isLoggedIn) {
      this.inviteInfo.run();
    } else {
      this._notify.toast({
        message: msg("Please log in to accept this invite."),
        variant: "warning",
        icon: "exclamation-triangle",
      });

      this._navigate.to(
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
            ${msg("You’ve been invited to join a new org")}
          </h1>
          ${this.inviteInfo.render({
            complete: (inviteInfo) =>
              renderInviteMessage(inviteInfo, {
                isExistingUser: true,
                isOrgMember: this._firstAdminOrgInfo !== null,
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
              complete: () =>
                this._firstAdminOrgInfo
                  ? html`
                      <btrix-org-form
                        orgId=${this._firstAdminOrgInfo.id}
                        name=${this._firstAdminOrgInfo.name}
                        slug=${this._firstAdminOrgInfo.slug}
                        @btrix-org-updated=${(
                          e: CustomEvent<OrgUpdatedDetail>,
                        ) => {
                          e.stopPropagation();
                          this._navigate.to(`/orgs/${e.detail.data.slug}`);
                        }}
                      ></btrix-org-form>
                    `
                  : html`
                      <div class="w-full text-center">
                        <sl-button
                          id="acceptButton"
                          class="my-3 block"
                          variant="primary"
                          @click=${this._onAccept}
                        >
                          ${msg("Accept Invitation")}
                        </sl-button>
                        <sl-button variant="text" @click=${this._onDecline}
                          >${msg("Decline")}</sl-button
                        >
                      </div>
                    `,
              error: (err) =>
                html`<btrix-alert variant="danger">
                  <div>${err instanceof Error ? err.message : err}</div>
                  ${this.authState && this.authState.username !== this.email
                    ? nothing
                    : html`
                        <a
                          href=${ROUTES.home}
                          @click=${this._navigate.link}
                          class="mt-3 inline-block underline hover:no-underline"
                        >
                          ${msg("Go to home page")}
                        </a>
                      `}
                </btrix-alert> `,
            })}
          </div>
        </div>
      </section>
    `;
  }

  async _getInviteInfo(token: string): Promise<UserOrgInviteInfo | void> {
    try {
      return await this._api.fetch<UserOrgInviteInfo>(
        `/users/me/invite/${token}`,
      );
    } catch (e) {
      console.debug(e);

      const status = isApiError(e) ? e.statusCode : null;

      switch (status) {
        case 404:
          throw new Error(
            msg(
              "This invite doesn't exist or has expired. Please ask the organization administrator to resend an invitation.",
            ),
          );
        case 400: {
          if (this.authState!.username === this.email) {
            throw new Error(
              msg(
                str`This is not a valid invite, or it may have expired. If you believe this is an error, please contact ${this.appState.settings?.supportEmail || msg("your Browsertrix administrator")} for help.`,
              ),
            );
          } else {
            throw new Error(
              msg(
                str`This invitation is for ${this.email}. You are currently logged in as ${this.authState!.username}. Please log in with the correct email to access this invite.`,
              ),
            );
          }
        }
        default:
          throw new Error(
            msg(
              str`Something unexpected went wrong retrieving this invite. Please contact ${this.appState.settings?.supportEmail || msg("your Browsertrix administrator")} for help.`,
            ),
          );
      }
    }
  }

  async _onAccept() {
    const inviteInfo = this.inviteInfo.value;

    if (!this.authState || !this._isLoggedIn || !inviteInfo) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    try {
      const { org } = await this._api.fetch<{ org: UserOrg }>(
        `/orgs/invite-accept/${this.token}`,
        {
          method: "POST",
        },
      );

      if (inviteInfo.firstOrgAdmin) {
        this._firstAdminOrgInfo = org;
      } else {
        const user = await this._getCurrentUser();

        AppStateService.updateUserInfo(formatAPIUser(user));
        AppStateService.updateOrgSlug(org.slug);

        await this.updateComplete;

        this._notify.toast({
          message: msg(
            str`You've joined ${org.name || inviteInfo.orgName || msg("Browsertrix")}.`,
          ),
          variant: "success",
          icon: "check2-circle",
        });

        this._navigate.to(`/orgs/${org.slug}`);
      }
    } catch (err) {
      if (isApiError(err) && err.message === "Invalid Invite Code") {
        this.serverError = msg("This invitation is not valid");
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }
  }

  _onDecline() {
    const { orgName } = this.inviteInfo.value || {};

    this._notify.toast({
      message: msg(
        str`You've declined to join ${orgName || msg("Browsertrix")}.`,
      ),
      variant: "info",
      icon: "info-circle",
    });

    this._navigate.to(this._navigate.orgBasePath);
  }

  async _getCurrentUser(): Promise<APIUser> {
    return this._api.fetch("/users/me", this.authState!);
  }
}
