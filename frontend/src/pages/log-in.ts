import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { Auth } from "../types/auth";

@localized()
export class LogInPage extends LiteElement {
  @state()
  isLoggingIn: boolean = false;

  @state()
  loginError?: string;

  render() {
    let formError;

    if (this.loginError) {
      formError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger">${this.loginError}</bt-alert>
        </div>
      `;
    }

    return html`
      <div class="md:bg-white md:shadow-2xl md:rounded-lg md:px-12 md:py-12">
        <div class="max-w-md">
          <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
            <div class="mb-5">
              <sl-input
                id="username"
                name="username"
                label="${msg("Username")}"
                required
              >
              </sl-input>
            </div>
            <div class="mb-5">
              <sl-input
                id="password"
                name="password"
                type="password"
                label="${msg("Password")}"
                required
              >
              </sl-input>
            </div>

            ${formError}

            <sl-button
              class="w-full"
              type="primary"
              ?loading=${this.isLoggingIn}
              submit
              >${msg("Log in")}</sl-button
            >
          </sl-form>
        </div>
      </div>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    this.isLoggingIn = true;

    const { formData } = event.detail;

    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    const params = new URLSearchParams();
    params.set("grant_type", "password");
    params.set("username", username);
    params.set("password", password);

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };

    const resp = await fetch("/api/auth/jwt/login", {
      headers,
      method: "POST",
      body: params.toString(),
    });
    if (resp.status !== 200) {
      this.isLoggingIn = false;
      this.loginError = msg("Sorry, invalid username or password");
      return;
    }

    try {
      const data = await resp.json();
      if (data.token_type === "bearer" && data.access_token) {
        const auth = "Bearer " + data.access_token;
        const detail = { auth, username };
        this.dispatchEvent(new CustomEvent("logged-in", { detail }));
      }
    } catch (e) {
      console.error(e);
    }

    this.isLoggingIn = false;
  }
}
