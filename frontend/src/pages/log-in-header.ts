import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import AuthService from "@/utils/AuthService";
import { ROUTES } from "@/routes";

@localized()
@customElement("btrix-log-in-header")
export class LoginSsoHeader extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  redirectUrl: string = ROUTES.home;

  @state()
  private serverError?: string;

  firstUpdated() {
    this.login()
  }

  render() {
    if (this.serverError) {
      return html`
        <article class="w-full max-w-md grid gap-5">
          <main class="md:bg-white md:border md:shadow-lg md:rounded-lg p-10">
            <div>
              <btrix-alert variant="danger">
              ${this.serverError}
              </btrix-alert>
            </div>
            <div style="margin-top: 20px">${this.renderBackButton()}</div>
          </main>
        </article>`;
    }
    return html` <div class="text-3xl"><sl-spinner></sl-spinner></div> `;
  }

  private renderBackButton() {

    return html`
      <form @submit=${this.onSubmitBack}>
        <sl-button
          class="w-full"
          variant="primary"
          type="submit"
          >${msg("Back To Log In")}</sl-button
        >
      </form>
    `;
  }

  private async login(): Promise<void> {
    try {
      const data = await AuthService.login_header({});

      this.dispatchEvent(
        AuthService.createLoggedInEvent({
          ...data,
          redirectUrl: this.redirectUrl,
        })
      );

      // no state update here, since "btrix-logged-in" event
      // will result in a route change
    } catch (e: any) {
      if (e.isApiError) {
        let message = msg("Sorry, an error occurred while attempting single sign-on");
        this.serverError = message;
      } else {
        let message = msg("Something went wrong, couldn't sign you in");
        this.serverError = message;
      }
    }
  }

  async onSubmitBack(event: SubmitEvent) {
    event.preventDefault();
    window.location.href = "/log-in";
  }
}
