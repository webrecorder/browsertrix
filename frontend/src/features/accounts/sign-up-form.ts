import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import type { UserOrgInviteInfo, UserRegisterResponseData } from "@/types/user";
import type { UnderlyingFunction } from "@/types/utils";
import AuthService from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import PasswordService from "@/utils/PasswordService";

export type SignUpSuccessDetail = {
  orgName?: string;
  orgSlug?: string;
};

const { PASSWORD_MINLENGTH, PASSWORD_MAXLENGTH, PASSWORD_MIN_SCORE } =
  PasswordService;

/**
 * @event submit
 * @event success
 * @event failure
 * @event authenticated
 * @event unauthenticated
 */
@customElement("btrix-sign-up-form")
@localized()
export class SignUpForm extends LiteElement {
  /** Optional read-only email, e.g. for invitations */
  @property({ type: String })
  email?: string;

  @property({ type: String })
  inviteToken?: string;

  @property({ type: Object })
  inviteInfo?: UserOrgInviteInfo;

  @property({ type: String })
  submitLabel?: string;

  @state()
  private serverError?: string;

  @state()
  private isSubmitting = false;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  @state()
  private showLoginLink = false;

  @query('sl-input[name="password"]')
  private readonly password?: SlInput | null;

  protected firstUpdated() {
    void PasswordService.setOptions();
  }

  render() {
    let serverError;

    if (this.serverError) {
      serverError = html`
        <div class="mb-5">
          <btrix-alert id="formError" variant="danger"
            >${this.serverError}
            ${this.showLoginLink
              ? html`<p>
                  Go to the
                  <a class="underline" href="/log-in">Log-In Page</a> and try
                  again.
                </p>`
              : ``}
          </btrix-alert>
        </div>
      `;
    }

    return html`
      <form @submit=${this.onSubmit} aria-describedby="formError">
        ${serverError}

        <div class="mb-5">
          <sl-input
            id="name"
            name="name"
            label=${msg("Your name")}
            autocomplete="nickname"
            minlength="2"
            class="hide-required-content"
            required
          >
          </sl-input>
          <p class="mt-2 text-xs text-neutral-500">
            ${msg(
              "Your full name, nickname, or another name that org collaborators can see.",
            )}
          </p>
        </div>
        <div class="mb-5">
          ${this.email
            ? html`
                <div style="font-size: var(--sl-input-label-font-size-medium)">
                  ${msg("Email")}
                </div>
                <div class="py-1 font-medium">${this.email}</div>
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
                  class="hide-required-content"
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
            label="${msg("Password")}"
            minlength=${PASSWORD_MINLENGTH}
            autocomplete="new-password"
            passwordToggle
            class="hide-required-content"
            required
            @sl-input=${this.onPasswordInput as UnderlyingFunction<
              typeof this.onPasswordInput
            >}
          >
          </sl-input>
          <p class="mt-2 text-xs text-neutral-500">
            ${msg(
              str`Choose a strong password between ${PASSWORD_MINLENGTH}–${PASSWORD_MAXLENGTH} characters.`,
            )}
          </p>
          ${when(this.pwStrengthResults, this.renderPasswordStrength)}
        </div>

        <sl-button
          class="w-full"
          variant="primary"
          ?loading=${this.isSubmitting}
          ?disabled=${!this.pwStrengthResults ||
          this.pwStrengthResults.score < PASSWORD_MIN_SCORE}
          type="submit"
        >
          ${this.submitLabel || msg("Create Account")}
        </sl-button>
      </form>
    `;
  }
  private readonly renderPasswordStrength = () => html`
    <div class="my-3">
      <btrix-pw-strength-alert
        .result=${this.pwStrengthResults ?? undefined}
        min=${PASSWORD_MIN_SCORE}
      >
      </btrix-pw-strength-alert>
    </div>
  `;

  private readonly onPasswordInput = debounce(150)(async () => {
    const value = this.password?.value;
    if (!value || value.length < 4) {
      this.pwStrengthResults = null;
      return;
    }
    const userInputs: string[] = [];
    if (this.email) {
      userInputs.push(this.email);
    }
    this.pwStrengthResults = await PasswordService.checkStrength(
      value,
      userInputs,
    );
  });

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("submit"));

    this.serverError = undefined;
    this.showLoginLink = false;
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
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
      registerParams.newOrg = false;
    }

    const resp = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerParams),
    });

    let data;
    let shouldLogIn = false;

    switch (resp.status) {
      case 201: {
        data = (await resp.json()) as UserRegisterResponseData;

        if (data.id) {
          shouldLogIn = true;
        }

        break;
      }
      case 400:
      case 422: {
        const { detail } = (await resp.json()) as {
          detail: string & { code: string };
        };
        if (
          detail === "user_already_exists" ||
          detail === "user_already_is_org_member"
        ) {
          shouldLogIn = true;
        } else if (detail.code && detail.code === "invalid_password") {
          this.serverError = msg(
            "Invalid password. Must be between 8 and 64 characters",
          );
        } else {
          this.serverError = msg("Invalid email or password");
        }
        break;
      }
      default:
        this.serverError = msg("Something unexpected went wrong");
        break;
    }

    if (this.serverError) {
      this.dispatchEvent(new CustomEvent("error"));
    } else {
      const org =
        data &&
        this.inviteInfo &&
        data.orgs.find(({ id }) => this.inviteInfo?.oid === id);

      this.dispatchEvent(
        new CustomEvent<SignUpSuccessDetail>("success", {
          detail: {
            orgName: org?.name,
            orgSlug: org?.slug,
          },
        }),
      );

      if (shouldLogIn) {
        try {
          await this.logIn({ email, password });
        } catch {
          this.serverError = msg(
            "User is already registered, but with a different password.",
          );
          this.showLoginLink = true;
          //this.dispatchEvent(new CustomEvent("unauthenticated"));
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
    const data = await AuthService.login({ email, password });

    this.dispatchEvent(new CustomEvent("authenticated", { detail: data }));
  }
}
