import { LitElement } from "lit";
import { state, query, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { CurrentUser } from "../types/user";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import type { AuthState, Auth } from "../utils/AuthService";
import AuthService from "../utils/AuthService";

@localized()
class RequestVerify extends LitElement {
  @property({ type: String })
  email!: string;

  @state()
  private isRequesting: boolean = false;

  @state()
  private requestSuccess: boolean = false;

  createRenderRoot() {
    return this;
  }

  render() {
    if (this.requestSuccess) {
      return html`
        <div class="text-sm text-gray-500 inline-flex items-center">
          <sl-icon class="mr-1" name="check-lg"></sl-icon> ${msg("Sent", {
            desc: "Status message after sending verification email",
          })}
        </div>
      `;
    }

    return html`
      <span
        class="text-sm text-primary hover:text-indigo-400"
        role="button"
        ?disabled=${this.isRequesting}
        @click=${this.requestVerification}
      >
        ${this.isRequesting
          ? msg("Sending...")
          : msg("Resend verification email")}
      </span>
    `;
  }

  private async requestVerification() {
    this.isRequesting = true;

    const resp = await fetch("/api/auth/request-verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.email,
      }),
    });

    switch (resp.status) {
      case 202:
        this.requestSuccess = true;
        break;
      default:
        // TODO generic toast error
        break;
    }

    this.isRequesting = false;
  }
}
customElements.define("btrix-request-verify", RequestVerify);

@needLogin
@localized()
export class AccountSettings extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  render() {
    if (!this.userInfo) return;
    return html`
      <div class="max-w-screen-sm mx-auto">
        <h1 class="text-xl font-semibold leading-8 mb-7">
          ${msg("Account Settings")}
        </h1>
        <form class="border rounded mb-5">
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-3">
              ${msg("Display Name")}
            </h2>
            <sl-input
              name="displayName"
              label=${msg(
                "Enter your full name, or another name to display in the orgs you belong to."
              )}
              value=${this.userInfo.name}
              maxlength="40"
              minlength="2"
            ></sl-input>
          </div>
          <footer class="flex items-center justify-end border-t px-4 py-3">
            <sl-button size="small" variant="primary">${msg("Save")}</sl-button>
          </footer>
        </form>
        <form class="border rounded mb-5">
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-3">
              ${msg("Email")}
            </h2>
            <sl-input
              name="email"
              label=${msg("Update the email you use to log in.")}
              value=${this.userInfo.email}
              type="email"
              minlength="2"
            ></sl-input>
          </div>
          <footer class="flex items-center justify-between border-t px-4 py-3">
            <btrix-request-verify
              email=${this.userInfo.email}
            ></btrix-request-verify>
            <sl-button size="small" variant="primary">${msg("Save")}</sl-button>
          </footer>
        </form>
        <form class="border rounded mb-5">
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-3">
              ${msg("Password")}
            </h2>
            <sl-input
              class="mb-3"
              name="password"
              label=${msg("Enter your current password")}
              type="password"
              autocomplete="current-password"
              password-toggle
            ></sl-input>
            <sl-input
              name="newPassword"
              label=${msg("New password")}
              type="password"
              autocomplete="new-password"
              password-toggle
            ></sl-input>
          </div>
          <footer class="flex items-center justify-end border-t px-4 py-3">
            <sl-button size="small" variant="primary">${msg("Save")}</sl-button>
          </footer>
        </form>
      </div>
    `;
  }
}
