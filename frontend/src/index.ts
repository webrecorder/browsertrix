import type { TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import "./shoelace";
import { LocalePicker } from "./components/locale-picker";
import { Alert } from "./components/alert";
import { AccountSettings } from "./components/account-settings";
import { SignUp } from "./pages/sign-up";
import { Verify } from "./pages/verify";
import { LogInPage } from "./pages/log-in";
import { ResetPassword } from "./pages/reset-password";
import { MyAccountPage } from "./pages/my-account";
import { ArchivePage } from "./pages/archive-info";
import { ArchiveConfigsPage } from "./pages/archive-info-tab";
import LiteElement, { html } from "./utils/LiteElement";
import APIRouter from "./utils/APIRouter";
import type { ViewState, NavigateEvent } from "./utils/APIRouter";
import type { AuthState, CurrentUser } from "./types/auth";
import theme from "./theme";

const ROUTES = {
  home: "/",
  signUp: "/sign-up",
  verify: "/verify?token",
  login: "/log-in",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password?token",
  myAccount: "/my-account",
  accountSettings: "/account/settings",
  "archive-info": "/archive/:aid",
  "archive-info-tab": "/archive/:aid/:tab",
} as const;

/**
 * @event navigate
 * @event need-login
 * @event logged-in
 * @event log-out
 * @event user-info-change
 */
@localized()
export class App extends LiteElement {
  private router: APIRouter = new APIRouter(ROUTES);

  @state()
  authState: AuthState | null = null;

  @state()
  userInfo?: CurrentUser;

  @state()
  viewState!: ViewState & {
    aid?: string;
    // TODO common tab type
    tab?: "running" | "finished" | "configs";
  };

  constructor() {
    super();

    const authState = window.localStorage.getItem("authState");
    if (authState) {
      this.authState = JSON.parse(authState);

      if (
        window.location.pathname === "/log-in" ||
        window.location.pathname === "/reset-password"
      ) {
        // Redirect to logged in home page
        this.viewState = this.router.match(ROUTES.myAccount);
        window.history.replaceState(
          this.viewState,
          "",
          this.viewState.pathname
        );
      }
    }

    this.syncViewState();
  }

  private syncViewState() {
    this.viewState = this.router.match(
      `${window.location.pathname}${window.location.search}`
    );
  }

  connectedCallback() {
    super.connectedCallback();

    window.addEventListener("popstate", (event) => {
      this.syncViewState();
    });
  }

  async updated(changedProperties: any) {
    if (changedProperties.has("authState") && this.authState) {
      const prevAuthState = changedProperties.get("authState");

      if (this.authState.username !== prevAuthState?.username) {
        this.updateUserInfo();
      }
    }
  }

  private async updateUserInfo() {
    try {
      const data = await this.getUserInfo();

      this.userInfo = {
        email: data.email,
        isVerified: data.is_verified,
      };
    } catch (err: any) {
      if (err?.message === "Unauthorized") {
        this.clearAuthState();
        this.navigate(ROUTES.login);
      }
    }
  }

  navigate(newViewPath: string) {
    if (newViewPath.startsWith("http")) {
      const url = new URL(newViewPath);
      newViewPath = `${url.pathname}${url.search}`;
    }

    if (newViewPath === "/log-in" && this.authState) {
      // Redirect to logged in home page
      this.viewState = this.router.match(ROUTES.myAccount);
    } else {
      this.viewState = this.router.match(newViewPath);
    }

    window.history.pushState(this.viewState, "", this.viewState.pathname);
  }

  navLink(event: Event) {
    event.preventDefault();
    this.navigate((event.currentTarget as HTMLAnchorElement).href);
  }

  render() {
    return html`
      <style>
        ${theme}
      </style>

      <div class="min-w-screen min-h-screen flex flex-col">
        ${this.renderNavBar()}
        <main class="relative flex-auto flex">${this.renderPage()}</main>
        <footer class="flex justify-center p-4 border-t">
          <bt-locale-picker></bt-locale-picker>
        </footer>
      </div>
    `;
  }

  renderNavBar() {
    return html`
      <nav
        class="flex items-center justify-between p-2 bg-gray-900 text-gray-50"
      >
        <div>
          <a href="/" @click="${this.navLink}"
            ><h1 class="text-base px-2">${msg("Browsertrix Cloud")}</h1></a
          >
        </div>
        <div class="grid grid-flow-col gap-5 items-center">
          ${this.authState
            ? html` <sl-dropdown>
                <div class="p-2" role="button" slot="trigger">
                  ${this.authState.username}
                  <span class="text-xs"
                    ><sl-icon name="chevron-down"></sl-icon
                  ></span>
                </div>
                <sl-menu>
                  <sl-menu-item
                    @click=${() => this.navigate(ROUTES.accountSettings)}
                  >
                    ${msg("Your account")}
                  </sl-menu-item>
                  <sl-menu-item @click="${this.onLogOut}"
                    >${msg("Log Out")}</sl-menu-item
                  >
                </sl-menu>
              </sl-dropdown>`
            : html`
                <a href="/log-in"> ${msg("Log In")} </a>
                <sl-button outline @click="${() => this.navigate("/sign-up")}">
                  <span class="text-white">${msg("Sign up")}</span>
                </sl-button>
              `}
        </div>
      </nav>
    `;
  }

  renderPage() {
    const navLink = ({ href, label }: { href: string; label: string }) => html`
      <li>
        <a
          class="block p-2 ${href === this.viewState.pathname
            ? "text-primary"
            : ""}"
          href="${href}"
          @click="${this.navLink}"
          >${label}</a
        >
      </li>
    `;
    const appLayout = (template: TemplateResult) => html`
      <div class="w-full flex flex-col md:flex-row">
        <nav class="md:w-80 md:p-4 md:border-r">
          <ul class="flex md:flex-col">
            ${navLink({ href: ROUTES.myAccount, label: "Archives" })}
            ${navLink({ href: "/users", label: "Users" })}
          </ul>
        </nav>
        <div class="p-4 md:p-8 flex-1">${template}</div>
      </div>
    `;

    switch (this.viewState.route) {
      case "signUp":
        return html`<btrix-sign-up
          class="w-full md:bg-gray-100 flex items-center justify-center"
          @navigate="${this.onNavigateTo}"
          @logged-in="${this.onLoggedIn}"
          @log-out="${this.onLogOut}"
          .authState="${this.authState}"
        ></btrix-sign-up>`;

      case "verify":
        return html`<btrix-verify
          class="w-full flex items-center justify-center"
          token="${this.viewState.params.token}"
          @navigate="${this.onNavigateTo}"
          @log-out="${this.onLogOut}"
          @user-info-change="${this.onUserInfoChange}"
          .authState="${this.authState}"
        ></btrix-verify>`;

      case "login":
      case "forgotPassword":
        return html`<log-in
          class="w-full md:bg-gray-100 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authState}
          .viewState=${this.viewState}
        ></log-in>`;

      case "resetPassword":
        return html`<btrix-reset-password
          class="w-full md:bg-gray-100 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authState}
          .viewState=${this.viewState}
        ></btrix-reset-password>`;

      case "home":
        return html`<div class="w-full flex items-center justify-center">
          <sl-button
            type="primary"
            size="large"
            @click="${() => this.navigate("/log-in")}"
          >
            ${msg("Log In")}
          </sl-button>
        </div>`;

      case "myAccount":
        return appLayout(html`<my-account
          class="w-full"
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authState}"
        ></my-account>`);

      case "accountSettings":
        return appLayout(html`<btrix-account-settings
          class="w-full"
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authState}"
          .userInfo="${this.userInfo}"
        ></btrix-account-settings>`);

      case "archive-info":
      case "archive-info-tab":
        return appLayout(html`<btrix-archive
          class="w-full"
          @navigate="${this.onNavigateTo}"
          .authState="${this.authState}"
          .viewState="${this.viewState}"
          aid="${this.viewState.params.aid}"
          tab="${this.viewState.tab || "running"}"
        ></btrix-archive>`);

      default:
        return html`<div>Not Found!</div>`;
    }
  }

  onLogOut(event: CustomEvent<{ redirect?: boolean }>) {
    const { detail } = event;
    const redirect = detail.redirect !== false;

    this.clearAuthState();

    if (redirect) {
      this.navigate("/");
    }
  }

  onLoggedIn(
    event: CustomEvent<{ api?: boolean; auth: string; username: string }>
  ) {
    const { detail } = event;
    this.authState = {
      username: detail.username,
      headers: { Authorization: detail.auth },
    };
    window.localStorage.setItem("authState", JSON.stringify(this.authState));

    if (!detail.api) {
      this.navigate(ROUTES.myAccount);
    }
  }

  onNeedLogin(event?: CustomEvent<{ api: boolean }>) {
    this.clearAuthState();

    if (event?.detail?.api) {
      // TODO refresh instead of redirect
    }
    this.navigate(ROUTES.login);
  }

  onNavigateTo(event: NavigateEvent) {
    this.navigate(event.detail);
  }

  onUserInfoChange(event: CustomEvent<Partial<CurrentUser>>) {
    // @ts-ignore
    this.userInfo = {
      ...this.userInfo,
      ...event.detail,
    };
  }

  clearAuthState() {
    this.authState = null;
    window.localStorage.setItem("authState", "");
  }

  getUserInfo() {
    return this.apiFetch("/users/me", this.authState!);
  }
}

customElements.define("bt-alert", Alert);
customElements.define("bt-locale-picker", LocalePicker);
customElements.define("browsertrix-app", App);
customElements.define("btrix-sign-up", SignUp);
customElements.define("btrix-verify", Verify);
customElements.define("log-in", LogInPage);
customElements.define("my-account", MyAccountPage);
customElements.define("btrix-archive", ArchivePage);
customElements.define("btrix-archive-configs", ArchiveConfigsPage);
customElements.define("btrix-account-settings", AccountSettings);
customElements.define("btrix-reset-password", ResetPassword);
