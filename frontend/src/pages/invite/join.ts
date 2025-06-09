import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { customElement, property, state } from "lit/decorators.js";

import { renderInviteMessage } from "./ui/inviteMessage";

import type { SignUpSuccessDetail } from "@/features/accounts/sign-up-form";
import type { OrgUpdatedDetail } from "@/pages/invite/ui/org-form";
import { OrgTab, RouteNamespace } from "@/routes";
import type { UserOrg, UserOrgInviteInfo } from "@/types/user";
import AuthService, { type LoggedInEventDetail } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

import "./ui/org-form";

@customElement("btrix-join")
@localized()
export class Join extends LiteElement {
  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  _firstAdminOrgInfo: null | Pick<UserOrg, "id" | "name" | "slug"> = null;

  private readonly inviteInfo = new Task(this, {
    task: async ([token, email]) => {
      if (!token || !email) throw new Error("Missing args");
      const inviteInfo = await this._getInviteInfo({ token, email });
      return inviteInfo;
    },
    args: () => [this.token, this.email] as const,
  });

  get _isLoggedIn(): boolean {
    return Boolean(
      this.authState && this.email && this.authState.username === this.email,
    );
  }

  render() {
    return html`
      <section
        class="flex min-h-full w-full flex-col justify-center gap-12 p-5 md:flex-row md:gap-16 md:py-16"
      >
        <header class="flex-1 pt-6 md:max-w-sm">
          <h1 class="mb-5 text-2xl font-semibold">
            ${msg("Welcome to Browsertrix")}
          </h1>
          ${this.inviteInfo.render({
            complete: (inviteInfo) =>
              renderInviteMessage(inviteInfo, {
                isExistingUser: false,
                isOrgMember: this._isLoggedIn,
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
                this._isLoggedIn && this._firstAdminOrgInfo
                  ? html`
                      <btrix-org-form
                        newOrgId=${this._firstAdminOrgInfo.id}
                        name=${this._firstAdminOrgInfo.name}
                        slug=${this._firstAdminOrgInfo.slug}
                        @btrix-org-updated=${(
                          e: CustomEvent<OrgUpdatedDetail>,
                        ) => {
                          e.stopPropagation();
                          this.navTo(
                            `/${RouteNamespace.PrivateOrgs}/${e.detail.data.slug}/${OrgTab.Dashboard}`,
                          );
                        }}
                      ></btrix-org-form>
                    `
                  : html`
                      <btrix-sign-up-form
                        email=${this.email!}
                        inviteToken=${this.token!}
                        .inviteInfo=${inviteInfo || undefined}
                        submitLabel=${inviteInfo?.firstOrgAdmin
                          ? msg("Next")
                          : msg("Create Account")}
                        @success=${this._onSignUpSuccess}
                        @authenticated=${this._onAuthenticated}
                      ></btrix-sign-up-form>
                    `,
              error: (err) =>
                html`<btrix-alert variant="danger">
                  <div>${err instanceof Error ? err.message : err}</div>
                  <a
                    href=${this.orgBasePath}
                    @click=${this.navLink}
                    class="mt-3 inline-block underline hover:no-underline"
                  >
                    ${msg("Go to home page")}
                  </a>
                </btrix-alert> `,
            })}
          </div>
        </div>
      </section>
    `;
  }

  async _getInviteInfo({
    token,
    email,
  }: {
    token: string;
    email: string;
  }): Promise<UserOrgInviteInfo | void> {
    const resp = await fetch(
      `/api/users/invite/${token}?email=${encodeURIComponent(email)}`,
    );

    console.log(this.appState.settings);
    switch (resp.status) {
      case 200:
        return (await resp.json()) as UserOrgInviteInfo;
      case 404:
        throw new Error(
          msg(
            "This invite doesn't exist or has expired. Please ask the organization administrator to resend an invitation.",
          ),
        );
      case 400:
        throw new Error(
          msg(
            str`This is not a valid invite, or it may have expired. If you believe this is an error, please contact ${this.appState.settings?.supportEmail || msg("your Browsertrix administrator")} for help.`,
          ),
        );
      default:
        throw new Error(
          msg(
            str`Something unexpected went wrong retrieving this invite. Please contact ${this.appState.settings?.supportEmail || msg("your Browsertrix administrator")} for help.`,
          ),
        );
    }
  }

  _onSignUpSuccess(e: CustomEvent<SignUpSuccessDetail>) {
    const inviteInfo = this.inviteInfo.value;
    if (!inviteInfo) return;

    if (inviteInfo.firstOrgAdmin) {
      const { orgName, orgSlug } = e.detail;
      this._firstAdminOrgInfo = {
        id: inviteInfo.oid,
        name: orgName || inviteInfo.orgName || "",
        slug: orgSlug || inviteInfo.orgSlug || "",
      };
    }
  }

  _onAuthenticated(event: CustomEvent<LoggedInEventDetail>) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        api: true, // Prevent default navigation
      }),
    );

    const inviteInfo = this.inviteInfo.value;

    if (!inviteInfo?.firstOrgAdmin) {
      if (inviteInfo?.orgSlug) {
        this.navTo(`/orgs/${inviteInfo.orgSlug}/dashboard`);
      } else {
        this.navTo(this.orgBasePath);
      }
    }
  }
}
