import { localized, msg, str } from "@lit/localize";
import type { SlInput, SlSelectEvent } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";
import { nothing, type PropertyValues } from "lit";
import { customElement, property, queryAsync, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import { TailwindElement } from "@/classes/TailwindElement";
import needLogin from "@/decorators/needLogin";
import { pageHeader } from "@/layouts/pageHeader";
import { allLocales, type LocaleCodeEnum } from "@/types/localization";
import type { UnderlyingFunction } from "@/types/utils";
import { isApiError } from "@/utils/api";
import LiteElement, { html } from "@/utils/LiteElement";
import PasswordService from "@/utils/PasswordService";
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";

enum Tab {
  Profile = "profile",
  Security = "security",
}

const { PASSWORD_MINLENGTH, PASSWORD_MAXLENGTH, PASSWORD_MIN_SCORE } =
  PasswordService;

@localized()
@customElement("btrix-request-verify")
export class RequestVerify extends TailwindElement {
  @property({ type: String })
  email!: string;

  @state()
  private isRequesting = false;

  @state()
  private requestSuccess = false;

  willUpdate(changedProperties: PropertyValues<this>) {
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
        <div class="inline-flex items-center text-sm text-gray-500">
          <sl-icon class="mr-1" name="check-lg"></sl-icon> ${msg("Sent", {
            desc: "Status message after sending verification email",
          })}
        </div>
      `;
    }

    return html`
      <span
        class="text-sm text-primary hover:text-primary-400"
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

@localized()
@customElement("btrix-account-settings")
@needLogin
export class AccountSettings extends LiteElement {
  @property({ type: String })
  tab: string | Tab = Tab.Profile;

  @state()
  sectionSubmitting: null | "name" | "email" | "password" = null;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  @queryAsync('sl-input[name="password"]')
  private readonly passwordInput?: Promise<SlInput | null>;

  private get activeTab() {
    return this.tab && Object.values(Tab).includes(this.tab as unknown as Tab)
      ? (this.tab as Tab)
      : Tab.Profile;
  }

  private get tabLabels(): Record<Tab, string> {
    return {
      [Tab.Profile]: msg("Profile"),
      [Tab.Security]: msg("Security"),
    };
  }

  protected firstUpdated() {
    void PasswordService.setOptions();
  }

  render() {
    return html`
      <btrix-document-title
        title=${msg("Account Settings")}
      ></btrix-document-title>

      ${pageHeader(msg("Account Settings"), undefined, tw`mb-3 lg:mb-5`)}

      <btrix-tab-list activePanel=${this.activeTab} hideIndicator>
        <header slot="header" class="flex h-7 items-end justify-between">
          ${choose(
            this.activeTab,
            [
              [Tab.Profile, () => html`<h2>${msg("Display Name")}</h2>`],
              [Tab.Security, () => html`<h2>${msg("Password")}</h2>`],
            ],
            () => html`<h2>${this.tabLabels[this.activeTab]}</h2>`,
          )}
        </header>
        ${this.renderTab(Tab.Profile)} ${this.renderTab(Tab.Security)}
        <btrix-tab-panel name=${Tab.Profile}>
          ${this.renderProfile()}
        </btrix-tab-panel>
        <btrix-tab-panel name=${Tab.Security}>
          ${this.renderSecurity()}
        </btrix-tab-panel>
      </btrix-tab-list>
    `;
  }

  private renderProfile() {
    if (!this.userInfo) return;

    return html`
      <form class="mb-5 rounded-lg border" @submit=${this.onSubmitName}>
        <div class="p-4">
          <p class="mb-2">
            ${msg(
              "Enter your full name, or another name to display in the orgs you belong to.",
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

      <h2 class="mb-2 mt-7 text-lg font-medium">${msg("Email")}</h2>
      <form class="rounded-lg border" @submit=${this.onSubmitEmail}>
        <div class="p-4">
          <p class="mb-2">${msg("Update the email you use to log in.")}</p>
          <sl-input
            name="email"
            value=${this.userInfo.email}
            type="email"
            aria-label=${msg("Email")}
          >
            <div slot="suffix">
              <sl-tooltip
                content=${this.userInfo.isVerified
                  ? msg("Verified")
                  : msg("Needs verification")}
                hoist
              >
                ${this.userInfo.isVerified
                  ? html`<sl-icon
                      class="text-success"
                      name="check-lg"
                    ></sl-icon>`
                  : html`<sl-icon
                      class="text-warning"
                      name="exclamation-circle"
                    ></sl-icon>`}
              </sl-tooltip>
            </div>
          </sl-input>
        </div>
        <footer class="flex items-center justify-end border-t px-4 py-3">
          ${!this.userInfo.isVerified
            ? html`
                <btrix-request-verify
                  class="mr-auto"
                  email=${this.userInfo.email}
                ></btrix-request-verify>
              `
            : ""}
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?loading=${this.sectionSubmitting === "email"}
            >${msg("Save")}</sl-button
          >
        </footer>
      </form>

      ${(allLocales as unknown as string[]).length > 1
        ? this.renderLanguage()
        : nothing}
    `;
  }

  private renderSecurity() {
    return html`
      <form class="rounded-lg border" @submit=${this.onSubmitPassword}>
        <div class="p-4">
          <sl-input
            class="mb-3"
            name="password"
            label=${msg("Enter your current password")}
            type="password"
            autocomplete="off"
            password-toggle
            required
          ></sl-input>
          <sl-input
            name="newPassword"
            label=${msg("New password")}
            type="password"
            autocomplete="new-password"
            password-toggle
            minlength="8"
            required
            @input=${this.onPasswordInput as UnderlyingFunction<
              typeof this.onPasswordInput
            >}
          ></sl-input>

          ${when(this.pwStrengthResults, this.renderPasswordStrength)}
        </div>
        <footer class="flex items-center justify-end border-t px-4 py-3">
          <p class="mr-auto text-neutral-500">
            ${msg(
              str`Choose a strong password between ${PASSWORD_MINLENGTH}-${PASSWORD_MAXLENGTH} characters.`,
            )}
          </p>
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?loading=${this.sectionSubmitting === "password"}
            ?disabled=${!this.pwStrengthResults ||
            this.pwStrengthResults.score < PASSWORD_MIN_SCORE}
            >${msg("Save")}</sl-button
          >
        </footer>
      </form>
    `;
  }

  private renderTab(name: Tab) {
    const isActive = name === this.activeTab;

    return html`
      <btrix-navigation-button
        slot="nav"
        href=${`/account/settings/${name}`}
        .active=${isActive}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        ${choose(name, [
          [
            Tab.Profile,
            () => html`<sl-icon name="file-person-fill"></sl-icon>`,
          ],
          [
            Tab.Security,
            () => html`<sl-icon name="shield-lock-fill"></sl-icon>`,
          ],
        ])}
        ${this.tabLabels[name]}
      </btrix-navigation-button>
    `;
  }

  private renderLanguage() {
    return html`
      <h2 class="mb-2 mt-7 flex items-center gap-2 text-lg font-medium">
        ${msg("Language")}
        <btrix-beta-badge>
          <div slot="content">
            <b>${msg("Translations are in beta")}</b>
            <p>
              ${msg(
                "Parts of the app may not be translated yet in some languages.",
              )}
            </p>
          </div>
        </btrix-beta-badge>
      </h2>
      <section class="mb-5 rounded-lg border">
        <div class="flex items-center justify-between gap-2 px-4 py-2.5">
          <h3>
            ${msg(
              "Choose your preferred language for displaying Browsertrix in your browser.",
            )}
          </h3>
          <btrix-user-language-select
            @sl-select=${this.onSelectLocale}
          ></btrix-user-language-select>
        </div>
        <footer class="flex items-center justify-start border-t px-4 py-3">
          <p class="text-neutral-600">
            ${msg("Help us translate Browsertrix.")}
            <a
              class="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600"
              href="https://docs.browsertrix.com/develop/localization/"
              target="_blank"
            >
              ${msg("Contribute to translations")}
              <sl-icon slot="suffix" name="arrow-right"></sl-icon
            ></a>
          </p>
        </footer>
      </section>
    `;
  }

  private readonly renderPasswordStrength = () => html`
    <div class="mt-4">
      <btrix-pw-strength-alert
        .result=${this.pwStrengthResults ?? undefined}
        min=${PASSWORD_MIN_SCORE}
      >
      </btrix-pw-strength-alert>
    </div>
  `;

  private readonly onPasswordInput = debounce(150)(async (e: InputEvent) => {
    const { value } = e.target as SlInput;
    if (!value || value.length < 4) {
      this.pwStrengthResults = null;
      return;
    }
    const userInputs: string[] = [];
    if (this.userInfo) {
      userInputs.push(this.userInfo.name, this.userInfo.email);
    }
    this.pwStrengthResults = await PasswordService.checkStrength(
      value,
      userInputs,
    );
  });

  private async onSubmitName(e: SubmitEvent) {
    if (!this.userInfo) return;
    const form = e.target as HTMLFormElement;
    const input = form.querySelector("sl-input")!;
    if (!input.checkValidity()) {
      return;
    }
    e.preventDefault();
    const newName = (serialize(form).displayName as string).trim();
    if (newName === this.userInfo.name) {
      return;
    }

    this.sectionSubmitting = "name";

    try {
      await this.apiFetch(`/users/me`, {
        method: "PATCH",
        body: JSON.stringify({
          email: this.userInfo.email,
          name: newName,
        }),
      });

      AppStateService.updateUser({
        ...this.userInfo,
        name: newName,
      });

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

  private async onSubmitEmail(e: SubmitEvent) {
    if (!this.userInfo) return;
    const form = e.target as HTMLFormElement;
    const input = form.querySelector("sl-input")!;
    if (!input.checkValidity()) {
      return;
    }
    e.preventDefault();
    const newEmail = (serialize(form).email as string).trim();
    if (newEmail === this.userInfo.email) {
      return;
    }

    this.sectionSubmitting = "email";

    try {
      await this.apiFetch(`/users/me`, {
        method: "PATCH",
        body: JSON.stringify({
          email: newEmail,
        }),
      });

      AppStateService.updateUser({
        ...this.userInfo,
        email: newEmail,
      });

      this.notify({
        message: msg("Your email has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't update email at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.sectionSubmitting = null;
  }

  private async onSubmitPassword(e: SubmitEvent) {
    if (!this.userInfo) return;
    const form = e.target as HTMLFormElement;
    const inputs = Array.from(form.querySelectorAll("sl-input"));
    if (inputs.some((input) => !input.checkValidity())) {
      return;
    }
    e.preventDefault();
    const { password, newPassword } = serialize(form);

    this.sectionSubmitting = "password";

    try {
      await this.apiFetch("/users/me/password-change", {
        method: "PUT",
        body: JSON.stringify({
          email: this.userInfo.email,
          password,
          newPassword,
        }),
      });

      this.notify({
        message: msg("Your password has been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      if (isApiError(e) && e.details === "invalid_current_password") {
        this.notify({
          message: msg("Please correct your current password and try again."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      } else {
        this.notify({
          message: msg("Sorry, couldn't update password at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }

    this.sectionSubmitting = null;
  }

  private readonly onSelectLocale = async (e: SlSelectEvent) => {
    const locale = e.detail.item.value as LocaleCodeEnum;

    if (locale !== this.appState.userPreferences?.locale) {
      AppStateService.partialUpdateUserPreferences({ locale });
    }

    this.notify({
      message: msg("Your language preference has been updated."),
      variant: "success",
      icon: "check2-circle",
    });
  };
}
