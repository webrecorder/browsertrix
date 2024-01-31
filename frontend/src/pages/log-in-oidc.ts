import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import AuthService from "@/utils/AuthService";
import { ROUTES } from "@/routes";

@localized()
@customElement("btrix-log-in-oidc")
export class LoginSsoOidc extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  redirectUrl: string = ROUTES.home;

  @property({ type: String })
  session_state: string = '';

  @property({ type: String })
  code: string = '';

  @state()
  private serverError?: string;

  firstUpdated() {
    let params = new URLSearchParams(window.location.search);
    this.session_state = params.get('session_state') || '' as string;
    this.code = params.get('code') || '' as string;

    if (this.code !== '' && this.session_state !== '') {
      this.login_callback();
    }
    else {
      this.login_init();
    }
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

  
  private async login_init(): Promise<void> {
    try {
      const redirect_url = await AuthService.login_oidc({});
      window.location.href = redirect_url;
    }
    catch (e: any) {
      if (e.isApiError) {
        let message = msg("Sorry, an error occurred while attempting Single Sign On");
        this.serverError = message;
      } else {
        let message = msg("Something went wrong, couldn't sign you in");
        this.serverError = message;
      }
    }
  }

  private async login_callback(): Promise<void> {
    try {
      const data = await AuthService.login_oidc_callback({session_state: this.session_state, code: this.code});

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
        let message = msg("Sorry, an error occurred while attempting Single Sign On");
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
