import { localized, msg, str } from "@lit/localize";
import type {
  SlChangeEvent,
  SlInput,
  SlSelectEvent,
  SlSwitch,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { ZxcvbnResult } from "@zxcvbn-ts/core";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { when } from "lit/directives/when.js";
import debounce from "lodash/fp/debounce";

import { BtrixElement } from "@/classes/BtrixElement";
import { TailwindElement } from "@/classes/TailwindElement";
import needLogin from "@/decorators/needLogin";
import { pageHeader } from "@/layouts/pageHeader";
import { type LanguageCode } from "@/types/localization";
import type { UnderlyingFunction } from "@/types/utils";
import { isApiError } from "@/utils/api";
import localize from "@/utils/localize";
import PasswordService from "@/utils/PasswordService";
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";

enum Tab {
  Profile = "profile",
  Security = "security",
}

const { PASSWORD_MINLENGTH, PASSWORD_MAXLENGTH, PASSWORD_MIN_SCORE } =
  PasswordService;

@customElement("btrix-request-verify")
@localized()
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

@customElement("btrix-account-settings")
@localized()
@needLogin
export class AccountSettings extends BtrixElement {
  @property({ type: String })
  tab: string | Tab = Tab.Profile;

  @state()
  sectionSubmitting: null | "name" | "email" | "password" = null;

  @state()
  private pwStrengthResults: null | ZxcvbnResult = null;

  @query('sl-input[name="newPassword"]')
  private readonly newPassword?: SlInput | null;

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

      ${pageHeader({
        title: msg("Account Settings"),
        classNames: tw`mb-3 lg:mb-5`,
      })}

      <btrix-tab-group active=${this.activeTab} placement="start">
        ${this.renderTab(Tab.Profile)} ${this.renderTab(Tab.Security)}
        <btrix-tab-group-panel name=${Tab.Profile}>
          ${this.renderProfile()}
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name=${Tab.Security}>
          ${this.renderSecurity()}
        </btrix-tab-group-panel>
      </btrix-tab-group>
    `;
  }

  private renderProfile() {
    if (!this.userInfo) return;

    return html`
      <h2 class="mb-2 text-lg font-medium">${msg("Display Name")}</h2>
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

      ${localize.languages.length > 1 ? this.renderLanguage() : nothing}
    `;
  }

  private renderSecurity() {
    return html`
      <h2 class="mb-2 text-lg font-medium">${msg("Password")}</h2>
      <form class="rounded-lg border" @submit=${this.onSubmitPassword}>
        <div class="p-4">
          <sl-input
            class="mb-3"
            name="password"
            label=${msg("Enter your current password")}
            type="password"
            autocomplete="current-password"
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
            @sl-input=${this.onPasswordInput as UnderlyingFunction<
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
    return html`
      <btrix-tab-group-tab
        slot="nav"
        panel=${name}
        href=${`/account/settings/${name}`}
        @click=${this.navigate.link}
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
      </btrix-tab-group-tab>
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
        <sl-switch
          .helpText=${msg(
            "Your browser’s language settings will take precedence over the language chosen above when formatting numbers, dates, and durations.",
          )}
          @sl-change=${this.onSelectFormattingPreference}
          ?checked=${this.appState.userPreferences
            ?.useBrowserLanguageForFormatting ?? true}
          class="mt-4 block px-4 pb-4 part-[label]:-order-1 part-[label]:me-2 part-[label]:ms-0 part-[base]:flex part-[form-control-help-text]:max-w-prose part-[label]:flex-grow"
          >${msg(
            "Use browser language settings for formatting numbers and dates.",
          )}</sl-switch
        >
        <div class="m-4 mt-0 text-xs">
          ${msg("For example:")}
          <btrix-badge
            >${this.localize.date(new Date(), {
              dateStyle: "short",
            })}</btrix-badge
          >
          <btrix-badge
            >${this.localize.date(new Date(), {
              timeStyle: "short",
            })}</btrix-badge
          >
          <btrix-badge
            >${this.localize.humanizeDuration(9283849, {
              unitCount: 2,
            })}</btrix-badge
          >
          <btrix-badge>${this.localize.bytes(3943298234)}</btrix-badge>
        </div>
        <footer class="flex items-center justify-start border-t px-4 py-3">
          <p class="text-neutral-600">
            ${msg("Help us translate Browsertrix.")}
            <btrix-link
              href="https://docs.browsertrix.com/develop/localization/"
              target="_blank"
              variant="primary"
            >
              ${msg("Contribute to translations")}
            </btrix-link>
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

  private readonly onPasswordInput = debounce(150)(async () => {
    const value = this.newPassword?.value;
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
      await this.api.fetch(`/users/me`, {
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

      this.notify.toast({
        message: msg("Your name has been updated."),
        variant: "success",
        icon: "check2-circle",
        id: "name-update-status",
      });
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't update name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "name-update-status",
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
      await this.api.fetch(`/users/me`, {
        method: "PATCH",
        body: JSON.stringify({
          email: newEmail,
        }),
      });

      AppStateService.updateUser({
        ...this.userInfo,
        email: newEmail,
      });

      this.notify.toast({
        message: msg("Your email has been updated."),
        variant: "success",
        icon: "check2-circle",
        id: "email-update-status",
      });
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't update email at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "email-update-status",
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
      await this.api.fetch("/users/me/password-change", {
        method: "PUT",
        body: JSON.stringify({
          email: this.userInfo.email,
          password,
          newPassword,
        }),
      });

      this.notify.toast({
        message: msg("Your password has been updated."),
        variant: "success",
        icon: "check2-circle",
        id: "password-update-status",
      });
    } catch (e) {
      if (isApiError(e) && e.details === "invalid_current_password") {
        this.notify.toast({
          message: msg("Please correct your current password and try again."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "password-update-status",
        });
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't update password at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "password-update-status",
        });
      }
    }

    this.sectionSubmitting = null;
  }

  /**
   * Save language setting in local storage
   */
  private readonly onSelectLocale = async (e: SlSelectEvent) => {
    const locale = e.detail.item.value as LanguageCode;

    if (locale !== this.appState.userPreferences?.language) {
      AppStateService.partialUpdateUserPreferences({ language: locale });
    }

    this.notify.toast({
      message: msg("Your language preference has been updated."),
      variant: "success",
      icon: "check2-circle",
      id: "language-update-status",
    });
  };

  /**
   * Save formatting setting in local storage
   */
  private readonly onSelectFormattingPreference = async (e: SlChangeEvent) => {
    const checked = (e.target as SlSwitch).checked;
    if (
      checked !== this.appState.userPreferences?.useBrowserLanguageForFormatting
    ) {
      AppStateService.partialUpdateUserPreferences({
        useBrowserLanguageForFormatting: checked,
      });
    }

    this.notify.toast({
      message: msg("Your formatting preference has been updated."),
      variant: "success",
      icon: "check2-circle",
      id: "account-settings-formatting",
    });
  };
}
