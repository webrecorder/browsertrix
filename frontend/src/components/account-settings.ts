import { LitElement } from "lit";
import { state, query, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";

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

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("email")) {
      this.isRequesting = false;
      this.requestSuccess = false;
    }
  }

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

  @state()
  sectionSubmitting: null | "name" | "email" | "password" = null;

  render() {
    if (!this.userInfo) return;
    return html`
      <div class="max-w-screen-sm mx-auto">
        <h1 class="text-xl font-semibold leading-8 mb-7">
          ${msg("Account Settings")}
        </h1>
        <form class="border rounded mb-5" @submit=${this.onSubmitName}>
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-4">
              ${msg("Display Name")}
            </h2>
            <p class="mb-2">
              ${msg(
                "Enter your full name, or another name to display in the orgs you belong to."
              )}
            </p>
            <sl-input
              name="displayName"
              value=${this.userInfo.name}
              maxlength="40"
              minlength="2"
              required
              aria-label=${msg("Display name")}
            ></sl-input>
          </div>
          <footer class="flex items-center justify-end border-t px-4 py-3">
            <sl-button
              type="submit"
              size="small"
              variant="primary"
              ?loading=${this.sectionSubmitting === "name"}
              >${msg("Save")}</sl-button
            >
          </footer>
        </form>
        <form class="border rounded mb-5">
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-4">
              ${msg("Email")}
            </h2>
            <p class="mb-2">${msg("Update the email you use to log in.")}</p>
            <sl-input
              name="email"
              value=${this.userInfo.email}
              type="email"
              minlength="2"
              aria-label=${msg("Email")}
            ></sl-input>
          </div>
          <footer class="flex items-center justify-between border-t px-4 py-3">
            <btrix-request-verify
              email=${this.userInfo.email}
            ></btrix-request-verify>
            <sl-button type="submit" size="small" variant="primary"
              >${msg("Save")}</sl-button
            >
          </footer>
        </form>
        <form class="border rounded mb-5">
          <div class="p-4">
            <h2 class="text-lg font-semibold leading-none mb-4">
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
            <sl-button type="submit" size="small" variant="primary"
              >${msg("Save")}</sl-button
            >
          </footer>
        </form>
      </div>
    `;
  }

  private async onSubmitName(e: SubmitEvent) {
    if (!this.userInfo) return;
    const form = e.target as HTMLFormElement;
    const input = form.querySelector("sl-input") as SlInput;
    if (!input.checkValidity()) {
      return;
    }
    e.preventDefault();
    const newName = input.value.trim();

    if (newName === this.userInfo.name) {
      return;
    }

    this.sectionSubmitting = "name";

    try {
      await this.apiFetch(`/users/me`, this.authState!, {
        method: "PATCH",
        body: JSON.stringify({
          email: this.userInfo.email,
          name: newName,
        }),
      });

      this.dispatchEvent(new CustomEvent("update-user-info"));
      this.notify({
        message: msg("Your name has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't update name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.sectionSubmitting = null;
  }
}
