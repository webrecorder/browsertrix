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
        <div
          class="text-center hero-content bg-base-200 shadow-2xl rounded-xl px-16 py-8"
        >
          <div class="max-w-md">
            <form action="" @submit="${this.onSubmit}">
              <div class="form-control">
                <label class="label">
                  <span class="label-text">User</span>
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Username"
                  class="input input-bordered"
                />
              </div>
              <div class="form-control">
                <label class="label">
                  <span class="label-text">Password</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Password"
                  class="input input-bordered"
                />
              </div>
              <div class="form-control py-4">
                <button class="btn btn-primary" type="submit">Log In</button>
              </div>
            </form>
            <div id="login-error" class="text-red-600">${this.loginError}</div>
          </div>
        </div>
      </div>
    `;
  }

  async onSubmit(event: Event) {
    event.preventDefault();

    const username = (this.querySelector("#username") as HTMLInputElement)!
      .value;

    const params = new URLSearchParams();
    params.set("grant_type", "password");
    params.set("username", username);
    params.set(
      "password",
      (this.querySelector("#password") as HTMLInputElement)!.value
    );

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
