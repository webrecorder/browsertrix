import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { OrgFormSubmitEventDetail } from "@/features/accounts/org-form";
import type { CurrentUser, UserOrg, UserOrgInviteInfo } from "@/types/user";
import { isApiError } from "@/utils/api";
import AuthService, {
  type AuthState,
  type LoggedInEventDetail,
} from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import { isOwner } from "@/utils/orgs";

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
    task: async ([authState, token, email]) => {
      if (authState) {
        // we're now authenticated, but haven't navigated away
        return;
      }
      if (!token || !email) throw new Error("Missing args");
      const inviteInfo = await this.getInviteInfo({ token, email });
      return inviteInfo;
    },
    args: () => [this.authState, this.token, this.email] as const,
  });

  private get orgInfo(): Partial<UserOrg> {
    const inviteInfo = this.inviteInfo.value;

    if (inviteInfo) {
      return {
        id: inviteInfo.oid,
        name: inviteInfo.orgName,
        slug: inviteInfo.orgSlug,
        role: inviteInfo.role,
      };
    }

    if (this.userInfo) {
      return this.userInfo.orgs[0];
    }

    return {
      name: "",
      slug: "",
    };
  }

  private get shouldShowOrgForm() {
    return isOwner(this.orgInfo.role);
  }

  render() {
    const isRegistered =
      this.authState && this.authState.username === this.email;

    return html`
      <section
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

        <div
          class="flex min-h-[27rem] max-w-md flex-1 items-center justify-center transition-all md:rounded-lg md:border md:bg-white md:p-12 md:shadow-lg"
        >
          ${when(isRegistered, this.renderOrgSetup, this.renderSignUp)}
        </div>
      </section>
    `;
  }

  private renderInviteMessage() {
    let message: string | TemplateResult = "";

    if (this.shouldShowOrgForm) {
      message = msg(
        "You're almost there! Register your account and organization to start web archiving.",
      );
    } else if (this.inviteInfo.value) {
      const { inviterName, orgName } = this.inviteInfo.value;

      if (inviterName && orgName) {
        message = msg(
          html`You’ve been invited by
            <strong class="font-medium">${inviterName}</strong>
            to join the organization
            <span class="font-medium text-primary"> ${orgName} </span>
            on Browsertrix.`,
        );
      } else if (orgName) {
        message = msg(
          html`Register your user account for the organization
            <span class="font-medium text-primary"> ${orgName} </span>
            on Browsertrix.`,
        );
      }
    }

    if (!message) return;

    return html` <p class="max-w-prose text-neutral-600">${message}</p> `;
  }

  private readonly renderOrgSetup = () => {
    if (this.authState && !this.userInfo) {
      // we're logged in but still loading user info
      // TODO pass user info loading state instead
      return this.renderPending();
    }

    const { name = "", slug = "" } = this.orgInfo;

    return html`<btrix-org-form
      name=${name}
      slug=${slug}
      @btrix-submit=${this.onSubmitOrgForm}
    ></btrix-org-form>`;
  };

  private readonly renderSignUp = () =>
    this.inviteInfo.render({
      pending: this.renderPending,
      complete: () => html`
        <btrix-sign-up-form
          email=${this.email!}
          inviteToken=${this.token!}
          .inviteInfo=${this.inviteInfo.value}
          @authenticated=${this.onAuthenticated}
        ></btrix-sign-up-form>
      `,
      error: (err) => html`<btrix-alert variant="danger">${err}</btrix-alert>`,
    });

  private readonly renderPending = () => html`
    <sl-spinner class="text-2xl"></sl-spinner>
  `;

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
        api: this.shouldShowOrgForm, // prevents navigation if org name is required
      }),
    );
  }

  private async onSubmitOrgForm(e: CustomEvent<OrgFormSubmitEventDetail>) {
    const { values } = e.detail;
    const { id, name, slug } = this.orgInfo;

    if (values.orgName === name && values.orgSlug === slug) {
      this.navTo(`/orgs/${slug}`);

      return;
    }

    try {
      await this.apiFetch(`/orgs/${id}/rename`, this.authState!, {
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
