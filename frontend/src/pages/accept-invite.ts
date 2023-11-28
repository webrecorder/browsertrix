import { state, property, customElement } from "lit/decorators.js";
import { msg, str, localized } from "@lit/localize";

import LiteElement, { html } from "@/utils/LiteElement";
import type { AuthState } from "@/utils/AuthService";
import { ROUTES } from "@/routes";

type InviteInfo = {
  inviterEmail: string;
  inviterName: string;
  orgName: string;
};

@localized()
@customElement("btrix-accept-invite")
export class AcceptInvite extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  serverError?: string;

  @state()
  private inviteInfo: InviteInfo = {
    inviterEmail: "",
    inviterName: "",
    orgName: "",
  };

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

  private get isLoggedIn(): boolean {
    return Boolean(
      this.authState && this.email && this.authState.username === this.email
    );
  }

  firstUpdated() {
    if (this.isLoggedIn) {
      this.getInviteInfo();
    } else {
      this.notify({
        message: msg("Log in to continue."),
        variant: "success",
        icon: "check2-circle",
        duration: 10000,
      });

      this.navTo(
        `/log-in?redirectUrl=${encodeURIComponent(
          `${window.location.pathname}${window.location.search}`
        )}`
      );
    }
  }

  render() {
    let serverError;

    if (this.serverError) {
      serverError = html`
        <div>
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    const hasInviteInfo = Boolean(this.inviteInfo.inviterEmail);
    const placeholder = html`<span
      class="inline-block bg-gray-100 rounded-full"
      style="width: 6em"
      >&nbsp;</span
    >`;

    if (serverError && !hasInviteInfo) {
      return serverError;
    }

    return html`
      <article class="w-full p-5 grid gap-5 justify-center text-center">
        ${serverError}

        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <div class="mb-3 text-sm text-gray-400">
            ${msg("Invited by ")}
            ${this.inviteInfo.inviterName ||
            this.inviteInfo.inviterEmail ||
            placeholder}
          </div>
          <p class="text-xl font-semibold mb-5">
            ${msg(
              html`You've been invited to join
                <span class="text-primary break-words"
                  >${hasInviteInfo
                    ? this.inviteInfo.orgName || msg("Browsertrix Cloud")
                    : placeholder}</span
                >`
            )}
          </p>

          <div class="text-center">
            <sl-button class="mr-2" variant="primary" @click=${this.onAccept}
              >${msg("Accept invitation")}</sl-button
            >
            <sl-button @click=${this.onDecline}>${msg("Decline")}</sl-button>
          </div>
        </main>
      </article>
    `;
  }

  private async getInviteInfo() {
    if (!this.authState) return;

    try {
      const data = await this.apiFetch<InviteInfo>(
        `/users/me/invite/${this.token}`,
        this.authState
      );

      this.inviteInfo = {
        inviterEmail: data.inviterEmail,
        inviterName: data.inviterName,
        orgName: data.orgName,
      };
    } catch {
      this.serverError = msg("This invitation is not valid");
    }
  }

  private async onAccept() {
    if (!this.authState || !this.isLoggedIn) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    try {
      await this.apiFetch(`/orgs/invite-accept/${this.token}`, this.authState, {
        method: "POST",
      });

      this.notify({
        message: msg(str`You've joined ${this.inviteInfo.orgName}.`),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(ROUTES.home);
    } catch (err: any) {
      if (err.isApiError && err.message === "Invalid Invite Code") {
        this.serverError = msg("This invitation is not valid");
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }
  }

  private onDecline() {
    this.notify({
      message: msg(str`You've declined to join ${this.inviteInfo.orgName}.`),
      variant: "info",
      icon: "info-circle",
    });

    this.navTo(ROUTES.home);
  }
}
