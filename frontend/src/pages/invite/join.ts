import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { customElement, property } from "lit/decorators.js";

import { renderInviteMessage } from "./ui/inviteMessage";

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

  private readonly inviteInfo = new Task(this, {
    task: async ([token, email]) => {
      if (!token || !email) throw new Error("Missing args");
      const inviteInfo = await this.getInviteInfo({ token, email });
      return inviteInfo;
    },
    args: () => [this.token, this.email] as const,
  });

  private get isLoggedIn(): boolean {
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
          <h1 class="mb-5 text-xl font-semibold">
            ${msg("Set up your Browsertrix account")}
          </h1>
          ${this.inviteInfo.render({
            complete: (inviteInfo) =>
              renderInviteMessage(inviteInfo, {
                isExistingUser: false,
                isLoggedIn: this.isLoggedIn,
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
                this.isLoggedIn && inviteInfo && inviteInfo.firstOrgAdmin
                  ? html`
                      <btrix-org-form
                        name=${inviteInfo.orgName || ""}
                        slug=${inviteInfo.orgSlug || ""}
                        @btrix-submit=${this.onSubmitOrgForm}
                      ></btrix-org-form>
                    `
                  : html`
                      <btrix-sign-up-form
                        email=${this.email!}
                        inviteToken=${this.token!}
                        .inviteInfo=${inviteInfo || undefined}
                        submitLabel=${msg("Next")}
                        @authenticated=${this.onAuthenticated}
                      ></btrix-sign-up-form>
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
    token,
    email,
  }: {
    token: string;
    email: string;
  }): Promise<UserOrgInviteInfo | void> {
    const resp = await fetch(
      `/api/users/invite/${token}?email=${encodeURIComponent(email)}`,
    );

    if (resp.status === 200) {
      return (await resp.json()) as UserOrgInviteInfo;
    } else if (resp.status === 404) {
      throw new Error(
        msg(
          "This invite doesn't exist or has expired. Please ask the organization administrator to resend an invitation.",
        ),
      );
    } else {
      throw new Error(msg("This invitation is not valid."));
    }
  }

  private onAuthenticated(event: CustomEvent<LoggedInEventDetail>) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        api: Boolean(this.inviteInfo.value?.firstOrgAdmin), // prevents navigation if org name is required
      }),
    );
  }

  private async onSubmitOrgForm(e: CustomEvent<OrgFormSubmitEventDetail>) {
    const inviteInfo = this.inviteInfo.value;
    if (!inviteInfo) return;

    const { values } = e.detail;
    const { oid, orgName, orgSlug } = inviteInfo;

    if (values.orgName === orgName && values.orgSlug === orgSlug) {
      this.navTo(`/orgs/${orgSlug}`);

      return;
    }

    try {
      await this.apiFetch(`/orgs/${oid}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({
          name: values.orgName,
          slug: values.orgSlug,
        }),
      });

      this.notify({
        message: msg("New org name saved."),
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
