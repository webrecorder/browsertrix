import LiteElement, { html } from "../utils/LiteElement";
import type { Auth } from "../types/auth";

export class LogInPage extends LiteElement {
  auth?: Auth;
  loginError: string = "";

  static get properties() {
    return {
      loginError: { type: String },
    };
  }

  render() {
    return html`
      <div class="hero min-h-screen bg-blue-400">
        <div class="hero-content bg-base-200 shadow-2xl rounded-xl px-12 py-12">
          <div class="max-w-md">
            <sl-form @sl-submit="${this.onSubmit}">
              <div class="mb-5">
                <sl-input
                  name="username"
                  label="Username"
                  placeholder="Username"
                  required
                >
                </sl-input>
              </div>
              <div class="mb-5">
                <sl-input
                  name="password"
                  type="password"
                  label="Password"
                  placeholder="Password"
                  required
                >
                </sl-input>
              </div>
              <sl-button class="w-full" type="primary" submit>Log in</sl-button>
            </sl-form>

            <div id="login-error" class="text-red-600">${this.loginError}</div>
          </div>
        </div>
      </div>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
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
      this.loginError = "Sorry, invalid credentials";
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

    if (!this.auth) {
      this.loginError = "Unknown login response";
    }
  }
}
