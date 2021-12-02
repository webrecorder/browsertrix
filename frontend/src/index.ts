import type { TemplateResult } from "lit";
import { state, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized } from "@lit/localize";
import type { SlDialog } from "@shoelace-style/shoelace";

import "./shoelace";
import { LocalePicker } from "./components/locale-picker";
import { Alert } from "./components/alert";
import { AccountSettings } from "./components/account-settings";
import { InviteForm } from "./components/invite-form";
import { SignUpForm } from "./components/sign-up-form";
import { Join } from "./pages/join";
import { SignUp } from "./pages/sign-up";
import { Verify } from "./pages/verify";
import { LogInPage } from "./pages/log-in";
import { ResetPassword } from "./pages/reset-password";
import { Archives } from "./pages/archives";
import { Archive, ArchiveTab } from "./pages/archive";
import { ArchiveConfigsPage } from "./pages/archive-info-tab";
import LiteElement, { html } from "./utils/LiteElement";
import APIRouter from "./utils/APIRouter";
import type { ViewState, NavigateEvent } from "./utils/APIRouter";
import type { AuthState, CurrentUser } from "./types/auth";
import theme from "./theme";

const ROUTES = {
  home: "/",
  signUp: "/sign-up",
  join: "/join/:token?email",
  verify: "/verify?token",
  login: "/log-in",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password?token",
  myAccount: "/my-account",
  accountSettings: "/account/settings",
  archives: "/archives",
  archive: "/archives/:id/:tab",
  archiveAddMember: "/archives/:id/:tab/add-member",
} as const;
const DASHBOARD_ROUTE = ROUTES.archives;

type DialogContent = {
  label?: TemplateResult | string;
  body?: TemplateResult | string;
  noHeader?: boolean;
};

/**
 * @event navigate
 * @event notify
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
  private viewState!: ViewState & {
    aid?: string;
    // TODO common tab type
    tab?: "running" | "finished" | "configs";
  };

  @state()
  private globalDialogContent: DialogContent = {};

  @query("#globalDialog")
  private globalDialog!: SlDialog;

  constructor() {
    super();

    const authState = window.localStorage.getItem("btrix.auth");
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
        id: data.id,
        email: data.email,
        name: data.name,
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
      this.viewState = this.router.match(DASHBOARD_ROUTE);
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

      <sl-dialog
        id="globalDialog"
        ?no-header=${this.globalDialogContent?.noHeader === true}
        label=${ifDefined(this.globalDialogContent?.label)}
        @sl-after-hide=${() => (this.globalDialogContent = {})}
        >${this.globalDialogContent?.body}</sl-dialog
      >
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
    const navLink = ({
      activeRoutes,
      href,
      label,
    }: {
      activeRoutes: string[];
      href: string;
      label: string;
    }) => html`
      <li>
        <a
          class="block p-2 ${activeRoutes.includes(this.viewState.route!)
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
            ${navLink({
              activeRoutes: ["archives", "archive"],
              href: DASHBOARD_ROUTE,
              label: "Archives",
            })}
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
          class="w-full md:bg-gray-100 flex items-center justify-center"
          token="${this.viewState.params.token}"
          @navigate="${this.onNavigateTo}"
          @notify="${this.onNotify}"
          @log-out="${this.onLogOut}"
          @user-info-change="${this.onUserInfoChange}"
          .authState="${this.authState}"
        ></btrix-verify>`;

      case "join":
        return html`<btrix-join
          class="w-full md:bg-gray-100 flex items-center justify-center"
          @logged-in="${this.onLoggedIn}"
          .authState="${this.authState}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-join>`;

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

      case "archives":
        return appLayout(html`<btrix-archives
          class="w-full"
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authState}"
          .userInfo="${this.userInfo}"
        ></btrix-archives>`);

      case "archive":
      case "archiveAddMember":
        return appLayout(html`<btrix-archive
          class="w-full"
          @navigate=${this.onNavigateTo}
          @need-login=${this.onNeedLogin}
          .authState=${this.authState}
          .userInfo=${this.userInfo}
          archiveId=${this.viewState.params.id}
          archiveTab=${this.viewState.params.tab as ArchiveTab}
          ?isAddingMember=${this.viewState.route === "archiveAddMember"}
        ></btrix-archive>`);

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

  onLogOut(event: CustomEvent<{ redirect?: boolean } | null>) {
    const detail = event.detail || {};
    const redirect = detail.redirect !== false;

    this.clearAuthState();

    if (redirect) {
      this.navigate("/");
    }
  }

  onLoggedIn(
    event: CustomEvent<{
      api?: boolean;
      firstLogin?: boolean;
      auth: string;
      username: string;
    }>
  ) {
    const { detail } = event;
    this.authState = {
      username: detail.username,
      headers: { Authorization: detail.auth },
    };
    window.localStorage.setItem("btrix.auth", JSON.stringify(this.authState));

    if (!detail.api) {
      this.navigate(DASHBOARD_ROUTE);
    }

    if (detail.firstLogin) {
      this.onFirstLogin({ email: detail.username });
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

  onNotify(
    event: CustomEvent<{
      title?: string;
      message?: string;
      type?: "success" | "warning" | "danger" | "primary";
      icon?: string;
      duration?: number;
    }>
  ) {
    const {
      title,
      message,
      type = "primary",
      icon = "info-circle",
      duration = 5000,
    } = event.detail;

    const escapeHtml = (html: any) => {
      const div = document.createElement("div");
      div.textContent = html;
      return div.innerHTML;
    };

    const alert = Object.assign(document.createElement("sl-alert"), {
      type: type,
      closable: true,
      duration: duration,
      style: [
        "--sl-panel-background-color: var(--sl-color-neutral-1000)",
        "--sl-color-neutral-700: var(--sl-color-neutral-0)",
        // "--sl-panel-border-width: 0px",
        "--sl-spacing-large: var(--sl-spacing-medium)",
      ].join(";"),
      innerHTML: `
        <sl-icon name="${icon}" slot="icon"></sl-icon>
        <span>
          ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
          ${message ? `<div>${escapeHtml(message)}</div>` : ""}
        </span>

      `,
    });

    document.body.append(alert);
    alert.toast();
  }

  clearAuthState() {
    this.authState = null;
    window.localStorage.setItem("btrix.auth", "");
  }

  getUserInfo() {
    return this.apiFetch("/users/me", this.authState!);
  }

  private showDialog(content: DialogContent) {
    this.globalDialogContent = content;
    this.globalDialog.show();
  }

  private closeDialog() {
    this.globalDialog.hide();
  }

  private onFirstLogin({ email }: { email: string }) {
    this.showDialog({
      label: "Welcome to Browsertrix Cloud",
      noHeader: true,
      body: html`
        <div class="grid gap-4 text-center">
          <p class="mt-8 text-2xl font-medium">Welcome to Browsertrix Cloud!</p>

          <p>
            A confirmation email was sent to: <br />
            <strong>${email}</strong>.
          </p>
          <p class="max-w-xs mx-auto">
            Click the link in your email to confirm your email address.
          </p>
        </div>

        <div class="mb-4 mt-8 text-center">
          <sl-button type="primary" @click=${() => this.closeDialog()}
            >Got it, go to dashboard</sl-button
          >
        </div>
      `,
    });
  }
}

customElements.define("bt-alert", Alert);
customElements.define("bt-locale-picker", LocalePicker);
customElements.define("browsertrix-app", App);
customElements.define("btrix-sign-up", SignUp);
customElements.define("btrix-sign-up-form", SignUpForm);
customElements.define("btrix-verify", Verify);
customElements.define("log-in", LogInPage);
customElements.define("btrix-archives", Archives);
customElements.define("btrix-archive", Archive);
customElements.define("btrix-archive-configs", ArchiveConfigsPage);
customElements.define("btrix-account-settings", AccountSettings);
customElements.define("btrix-invite-form", InviteForm);
customElements.define("btrix-join", Join);
customElements.define("btrix-reset-password", ResetPassword);
