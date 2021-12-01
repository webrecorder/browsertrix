import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

/**
 * @event submit
 * @event success
 * @event failure
 * @event authenticated
 * @event unauthenticated
 */
@localized()
export class SignUpForm extends LiteElement {
  /** Optonal read-only email, e.g. for invitations */
  @property({ type: String })
  email?: string;

  @property({ type: String })
  inviteToken?: string;

  @state()
  private serverError?: string;

  @state()
  private isSubmitting: boolean = false;

  render() {
    let serverError;

    if (this.serverError) {
      serverError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger">${this.serverError}</bt-alert>
        </div>
      `;
    }

    return html`
      <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
        <div class="mb-5">
          <sl-input
            id="email"
            name="email"
            type="email"
            label=${msg("Email")}
            placeholder=${msg("you@email.com")}
            value=${ifDefined(this.email)}
            autocomplete="username"
            ?readonly=${Boolean(this.email)}
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="password"
            name="password"
            type="password"
            label=${msg("Password")}
            autocomplete="new-password"
            toggle-password
            required
          >
          </sl-input>
        </div>

        ${serverError}

        <sl-button
          class="w-full"
          type="primary"
          ?loading=${this.isSubmitting}
          submit
          >${msg("Sign up")}</sl-button
        >
      </sl-form>
    `;
  }

  private async onSubmit(event: { detail: { formData: FormData } }) {
    this.dispatchEvent(new CustomEvent("submit"));

    this.serverError = undefined;
    this.isSubmitting = true;

    const { formData } = event.detail;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const registerParams: {
      email: string;
      password: string;
      newArchive: boolean;
      inviteToken?: string;
    } = {
      email,
      password,
      newArchive: true,
    };

    if (this.inviteToken) {
      registerParams.inviteToken = this.inviteToken;
    }

    const resp = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerParams),
    });

    let shouldLogIn = false;

    switch (resp.status) {
      case 201:
        const data = await resp.json();

        if (data.is_active) {
          shouldLogIn = true;
        }

        break;
      case 400:
      case 422:
        const { detail } = await resp.json();
        if (detail === "REGISTER_USER_ALREADY_EXISTS") {
          shouldLogIn = true;
        } else {
          // TODO show validation details
          this.serverError = msg("Invalid email address or password");
        }
        break;
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    if (this.serverError) {
      this.dispatchEvent(new CustomEvent("error"));
    } else {
      this.dispatchEvent(new CustomEvent("success"));

      if (shouldLogIn) {
        try {
          await this.logIn({ email, password });
        } catch {
          this.dispatchEvent(new CustomEvent("unauthenticated"));
        }
      }
    }

    this.isSubmitting = false;
  }

  private async logIn({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) {
    const loginParams = new URLSearchParams();
    loginParams.set("grant_type", "password");
    loginParams.set("username", email);
    loginParams.set("password", password);

    const resp = await fetch("/api/auth/jwt/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loginParams.toString(),
    });

    if (resp.status !== 200) {
      throw new Error(resp.statusText);
    }

    // TODO consolidate with log-in method
    const data = await resp.json();
    if (data.token_type === "bearer" && data.access_token) {
      const auth = "Bearer " + data.access_token;
      const detail = { auth, username: email };

      this.dispatchEvent(new CustomEvent("authenticated", { detail }));
    } else {
      throw new Error("Unknown authorization type");
    }
  }
}
