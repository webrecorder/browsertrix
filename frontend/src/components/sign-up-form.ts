import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import AuthService from "../utils/AuthService";

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
          <btrix-alert id="formError" type="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
        <div class="mb-5">
          ${this.email
            ? html`
                <span class="text-gray-400">${msg("Joining as")}</span>
                <span class="text-primary font-medium">${this.email}</span>
                <input
                  type="hidden"
                  id="email"
                  name="email"
                  value=${this.email}
                />
              `
            : html`
                <sl-input
                  id="email"
                  name="email"
                  type="email"
                  label=${msg("Enter your email")}
                  placeholder=${msg("you@email.com")}
                  autocomplete="email"
                  required
                >
                </sl-input>
              `}
        </div>
        <div class="mb-5">
          <sl-input
            id="password"
            name="password"
            type="password"
            label=${msg("Create a password")}
            autocomplete="new-password"
            toggle-password
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-input
            id="name"
            name="name"
            label=${msg("Your name")}
            placeholder=${msg("Lisa Simpson", {
              desc: "Example user's name",
            })}
            autocomplete="nickname"
          >
          </sl-input>
          <p class="mt-2 text-sm text-gray-500">
            <span class="text-gray-400">${msg("(optional)")}</span> ${msg(
              "Your name will be visible to archive collaborators."
            )}
          </p>
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
    const name = formData.get("name") as string;
    const registerParams: {
      email: string;
      password: string;
      name: string;
      newArchive: boolean;
      inviteToken?: string;
    } = {
      email,
      password,
      name: name || email,
      newArchive: true,
    };

    if (this.inviteToken) {
      registerParams.inviteToken = this.inviteToken;
      registerParams.newArchive = false;
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
    try {
      const data = await AuthService.login({ email, password });

      this.dispatchEvent(new CustomEvent("authenticated", { detail: data }));
    } catch (e) {
      throw e;
    }
  }
}
