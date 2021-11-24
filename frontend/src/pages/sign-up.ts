import { state, property, query } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class SignUp extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @state()
  isSignUpComplete?: boolean;

  @state()
  serverError?: string;

  @state()
  isSubmitting: boolean = false;

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
      <article class="w-full max-w-sm grid gap-5">
        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          ${this.isSignUpComplete
            ? html`
                <div
                  class="text-2xl font-semibold mb-5 text-primary"
                  role="alert"
                >
                  ${msg("Successfully signed up")}
                </div>
                <p class="text-lg">
                  ${msg(
                    "Click the link in the verification email we sent you to log in."
                  )}
                </p>
              `
            : html`
                <h1 class="text-3xl font-semibold mb-5">${msg("Sign up")}</h1>

                <sl-form
                  @sl-submit="${this.onSubmit}"
                  aria-describedby="formError"
                >
                  <div class="mb-5">
                    <sl-input
                      id="email"
                      name="email"
                      label=${msg("Email")}
                      placeholder=${msg("you@email.com")}
                      autocomplete="username"
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
              `}
        </main>
      </article>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    this.isSubmitting = true;

    if (this.authState) {
      this.dispatchEvent(
        new CustomEvent("log-out", { detail: { redirect: false } })
      );
    }

    const { formData } = event.detail;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const registerParams = {
      email,
      password,
      newArchive: true,
    };

    const resp = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerParams),
    });

    switch (resp.status) {
      case 201:
        const data = await resp.json();

        if (data.is_active) {
          // Log in right away
          try {
            await this.logIn({ email, password });
          } catch {
            // Fallback to sign up message
            this.isSignUpComplete = true;
          }
        } else {
          this.isSignUpComplete = true;
        }

        break;
      case 400:
      case 422:
        const { detail } = await resp.json();
        if (detail === "REGISTER_USER_ALREADY_EXISTS") {
          // Try logging user in
          try {
            await this.logIn({ email, password });
          } catch {
            this.serverError = msg("Invalid email address or password");
          }
        } else {
          // TODO show validation details
          this.serverError = msg("Invalid email address or password");
        }
        break;
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    this.isSubmitting = false;
  }

  async logIn({ email, password }: { email: string; password: string }) {
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
      this.dispatchEvent(new CustomEvent("logged-in", { detail }));
    } else {
      throw new Error("Unknown authorization type");
    }
  }
}
