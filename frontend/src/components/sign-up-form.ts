import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized } from "@lit/localize";
import debounce from "lodash/fp/debounce";
import { when } from "lit/directives/when.js";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";

import LiteElement, { html } from "../utils/LiteElement";
import AuthService from "../utils/AuthService";
import PasswordService from "../utils/PasswordService";
import type { Input as BtrixInput } from "./input/input";

const PASSWORD_MIN_SCORE = 3;

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

  @property({ type: Boolean })
  // TODO replace with org info
  // https://github.com/ikreymer/browsertrix-cloud/issues/35
  isOrgInvite?: boolean;

  @state()
  private serverError?: string;

  @state()
  private isSubmitting: boolean = false;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  protected firstUpdated() {
    PasswordService.setOptions();
  }

  render() {
    let serverError;

    if (this.serverError) {
      serverError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      <form @submit=${this.onSubmit} aria-describedby="formError">
        <div class="mb-5 ml-7">
          ${this.email
            ? html`
                <div style="font-size: var(--sl-input-label-font-size-medium)">
                  ${msg("Joining as")}
                </div>
                <div class="font-medium py-1">${this.email}</div>
                <input
                  type="hidden"
                  id="email"
                  name="email"
                  value=${this.email}
                />
              `
            : html`
                <btrix-input
                  id="email"
                  name="email"
                  type="email"
                  label=${msg("Enter your email")}
                  placeholder=${msg("you@email.com")}
                  autocomplete="email"
                  required
                >
                </btrix-input>
              `}
        </div>
        <div class="mb-5 list-">
          <btrix-input
            id="name"
            name="name"
            label=${msg("Your name")}
            placeholder=${msg("Lisa Simpson", {
              desc: "Example user's name",
            })}
            autocomplete="nickname"
            minlength="2"
          >
          </btrix-input>
          <p class="mt-2 text-gray-500">
            ${msg("Your name will be visible to organization collaborators.")}
          </p>
        </div>
        <div class="mb-5">
          <btrix-input
            id="password"
            name="password"
            type="password"
            label="${msg("Password")}"
            minlength="8"
            autocomplete="new-password"
            passwordToggle
            required
            @input=${this.onPasswordInput}
          >
          </btrix-input>
          <p class="mt-2 text-gray-500">
            ${msg("Choose a strong password between 8 and 64 characters.")}
          </p>
          ${when(this.pwStrengthResults, this.renderPasswordStrength)}
        </div>

        ${serverError}

        <sl-button
          class="w-full"
          variant="primary"
          ?loading=${this.isSubmitting}
          ?disabled=${!this.pwStrengthResults ||
          this.pwStrengthResults.score < PASSWORD_MIN_SCORE}
          type="submit"
          >${msg("Sign up")}</sl-button
        >
      </form>
    `;
  }

  private renderPasswordStrength = () => {
    return html`
      <div class="my-3">
        <btrix-pw-strength-alert
          .result=${this.pwStrengthResults}
          min=${PASSWORD_MIN_SCORE}
        >
        </btrix-pw-strength-alert>
      </div>
    `;
  };

  private onPasswordInput = debounce(100)(async (e: InputEvent) => {
    const { value } = e.target as BtrixInput;
    if (!value) {
      this.pwStrengthResults = null;
    }
    const userInputs: string[] = [];
    if (this.email) {
      userInputs.push(this.email);
    }
    this.pwStrengthResults = await PasswordService.checkStrength(
      value,
      userInputs
    );
  }) as any;

  private async onSubmit(event: SubmitEvent) {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("submit"));

    this.serverError = undefined;
    this.isSubmitting = true;

    const formData = new FormData(form);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;
    const registerParams: {
      email: string;
      password: string;
      name: string;
      newOrg: boolean;
      inviteToken?: string;
    } = {
      email,
      password,
      name: name || email,
      newOrg: true,
    };

    if (this.inviteToken) {
      registerParams.inviteToken = this.inviteToken;

      if (this.isOrgInvite) {
        registerParams.newOrg = false;
      }
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
        } else if (detail.code && detail.code === "REGISTER_INVALID_PASSWORD") {
          this.serverError = msg(
            "Invalid password. Must be between 8 and 64 characters"
          );
        } else {
          this.serverError = msg("Invalid email or password");
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
