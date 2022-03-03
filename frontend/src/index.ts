import type { TemplateResult } from "lit";
import { render } from "lit";
import { state, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized } from "@lit/localize";
import type { SlDialog } from "@shoelace-style/shoelace";
import "tailwindcss/tailwind.css";

import type { ArchiveTab } from "./pages/archive";
import type { NotifyEvent, NavigateEvent } from "./utils/LiteElement";
import LiteElement, { html } from "./utils/LiteElement";
import APIRouter from "./utils/APIRouter";
import AuthService from "./utils/AuthService";
import type { LoggedInEvent } from "./utils/AuthService";
import type { ViewState } from "./utils/APIRouter";
import type { CurrentUser } from "./types/user";
import type { AuthState } from "./utils/AuthService";
import theme from "./theme";
import { ROUTES, DASHBOARD_ROUTE } from "./routes";
import "./shoelace";
import "./components";
import "./pages";

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
  authService: AuthService = new AuthService();

  @state()
  userInfo?: CurrentUser;

  @state()
  private viewState!: ViewState;

  @state()
  private globalDialogContent: DialogContent = {};

  @query("#globalDialog")
  private globalDialog!: SlDialog;

  @state()
  private isAppSettingsLoaded: boolean = false;

  @state()
  private isRegistrationEnabled?: boolean;

  constructor() {
    super();

    const authState = this.authService.retrieve();

    if (authState) {
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

  async firstUpdated() {
    if (this.authService.authState) {
      this.updateUserInfo();
    }

    const settings = await this.getAppSettings();

    if (settings) {
      this.isRegistrationEnabled = settings.registrationEnabled;
    }

    this.isAppSettingsLoaded = true;
  }

  private async updateUserInfo() {
    try {
      const data = await this.getUserInfo();

      this.userInfo = {
        id: data.id,
        email: data.email,
        name: data.name,
        isVerified: data.is_verified,
        isAdmin: data.is_superuser,
      };
    } catch (err: any) {
      if (err?.message === "Unauthorized") {
        console.debug(
          "Unauthorized with authState:",
          this.authService.authState
        );
        this.authService.logout();
        this.navigate(ROUTES.login);
      }
    }
  }

  async getAppSettings(): Promise<{ registrationEnabled: boolean } | void> {
    const resp = await fetch("/api/settings", {
      headers: { "Content-Type": "application/json" },
    });

    if (resp.status === 200) {
      const body = await resp.json();

      return body;
    } else {
      console.debug(resp);
    }
  }

  navigate(newViewPath: string, state?: object) {
    let url;

    if (newViewPath.startsWith("http")) {
      url = new URL(newViewPath);
    } else {
      url = new URL(
        `${window.location.origin}/${newViewPath.replace(/^\//, "")}`
      );
    }

    // Remove hash from path for matching
    newViewPath = `${url.pathname}${url.search}`;

    if (newViewPath === "/log-in" && this.authService.authState) {
      // Redirect to logged in home page
      this.viewState = this.router.match(DASHBOARD_ROUTE);
    } else {
      this.viewState = this.router.match(newViewPath);
    }

    this.viewState.data = state;

    window.history.pushState(
      this.viewState,
      "",
      `${this.viewState.pathname}${url.hash}${url.search}`
    );
  }

  navLink(event: Event) {
    event.preventDefault();
    this.navigate((event.currentTarget as HTMLAnchorElement).href);
  }

  render() {
    return html`
      <style>
        .uppercase {
          letter-spacing: 0.06em;
        }

        ${theme}
      </style>

      <div class="min-w-screen min-h-screen flex flex-col">
        ${this.renderNavBar()}
        <main class="relative flex-auto flex">${this.renderPage()}</main>
        <footer class="flex justify-center p-4 border-t">
          <btrix-locale-picker></btrix-locale-picker>
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
      <div class="border-b">
        <nav
          class="max-w-screen-lg mx-auto px-3 box-border h-12 flex items-center justify-between"
        >
          <div>
            <a href="/archives" @click="${this.navLink}"
              ><h1 class="text-base">${msg("Browsertrix Cloud")}</h1></a
            >
          </div>
          <div class="grid grid-flow-col gap-5 items-center">
            ${this.authService.authState
              ? html` <sl-dropdown placement="bottom-end">
                  <div class="p-2" role="button" slot="trigger">
                    ${this.userInfo?.name || this.userInfo?.email}
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
                    ${this.userInfo?.isAdmin
                      ? html` <sl-menu-item
                          @click=${() => this.navigate(ROUTES.usersInvite)}
                        >
                          ${msg("Invite Users")}
                        </sl-menu-item>`
                      : ""}
                    <sl-menu-item @click="${this.onLogOut}"
                      >${msg("Log Out")}</sl-menu-item
                    >
                  </sl-menu>
                </sl-dropdown>`
              : html`
                  <a href="/log-in"> ${msg("Log In")} </a>
                  ${this.isRegistrationEnabled
                    ? html`
                        <sl-button
                          type="text"
                          @click="${() => this.navigate("/sign-up")}"
                        >
                          ${msg("Sign up")}
                        </sl-button>
                      `
                    : html``}
                `}
          </div>
        </nav>
      </div>
    `;
  }

  renderPage() {
    switch (this.viewState.route) {
      case "signUp": {
        if (!this.isAppSettingsLoaded) {
          return html`<div
            class="w-full md:bg-gray-50 flex items-center justify-center"
          ></div>`;
        }
        if (this.isRegistrationEnabled) {
          return html`<btrix-sign-up
            class="w-full md:bg-gray-50 flex items-center justify-center"
            @navigate="${this.onNavigateTo}"
            @logged-in="${this.onLoggedIn}"
            @log-out="${this.onLogOut}"
            .authState="${this.authService.authState}"
          ></btrix-sign-up>`;
        } else {
          return this.renderNotFoundPage();
        }
      }

      case "verify":
        return html`<btrix-verify
          class="w-full md:bg-gray-50 flex items-center justify-center"
          token="${this.viewState.params.token}"
          @navigate="${this.onNavigateTo}"
          @notify="${this.onNotify}"
          @log-out="${this.onLogOut}"
          @user-info-change="${this.onUserInfoChange}"
          .authState="${this.authService.authState}"
        ></btrix-verify>`;

      case "join":
        return html`<btrix-join
          class="w-full md:bg-gray-50 flex items-center justify-center"
          @navigate="${this.onNavigateTo}"
          @logged-in="${this.onLoggedIn}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-join>`;

      case "acceptInvite":
        return html`<btrix-accept-invite
          class="w-full md:bg-gray-50 flex items-center justify-center"
          @navigate="${this.onNavigateTo}"
          @logged-in="${this.onLoggedIn}"
          @notify="${this.onNotify}"
          .authState="${this.authService.authState}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-accept-invite>`;

      case "login":
      case "loginWithRedirect":
      case "forgotPassword":
        return html`<btrix-log-in
          class="w-full md:bg-gray-50 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authService.authState}
          .viewState=${this.viewState}
          redirectUrl=${this.viewState.params.redirectUrl}
        ></btrix-log-in>`;

      case "resetPassword":
        return html`<btrix-reset-password
          class="w-full md:bg-gray-50 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authService.authState}
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
        return html`<btrix-archives
          class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authService.authState}"
          .userInfo="${this.userInfo}"
        ></btrix-archives>`;

      case "archive":
      case "archiveAddMember":
      case "archiveNewResourceTab":
      case "crawl":
      case "crawlTemplate":
      case "crawlTemplateEdit":
        return html`<btrix-archive
          class="w-full"
          @navigate=${this.onNavigateTo}
          @need-login=${this.onNeedLogin}
          @notify="${this.onNotify}"
          .authState=${this.authService.authState}
          .userInfo=${this.userInfo}
          .viewStateData=${this.viewState.data}
          archiveId=${this.viewState.params.id}
          archiveTab=${this.viewState.params.tab as ArchiveTab}
          crawlConfigId=${this.viewState.params.crawlConfigId}
          crawlId=${this.viewState.params.crawlId}
          ?isAddingMember=${this.viewState.route === "archiveAddMember"}
          ?isNewResourceTab=${this.viewState.route === "archiveNewResourceTab"}
          ?isEditing=${Boolean(this.viewState.params.edit)}
        ></btrix-archive>`;

      case "accountSettings":
        return html`<btrix-account-settings
          class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authService.authState}"
          .userInfo="${this.userInfo}"
        ></btrix-account-settings>`;

      case "usersInvite": {
        if (this.userInfo?.isAdmin) {
          return html`<btrix-users-invite
            class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
            @navigate="${this.onNavigateTo}"
            @need-login="${this.onNeedLogin}"
            .authState="${this.authService.authState}"
            .userInfo="${this.userInfo}"
          ></btrix-users-invite>`;
        } else {
          return this.renderNotFoundPage();
        }
      }

      default:
        return this.renderNotFoundPage();
    }
  }

  renderNotFoundPage() {
    return html`<btrix-not-found
      class="w-full md:bg-gray-50 flex items-center justify-center"
    ></btrix-not-found>`;
  }

  onLogOut(event: CustomEvent<{ redirect?: boolean } | null>) {
    const detail = event.detail || {};
    const redirect = detail.redirect !== false;

    this.authService.logout();
    this.authService = new AuthService();

    if (redirect) {
      this.navigate("/");
    }
  }

  onLoggedIn(event: LoggedInEvent) {
    const { detail } = event;

    this.authService.startPersist({
      username: detail.username,
      headers: detail.headers,
      tokenExpiresAt: detail.tokenExpiresAt,
    });

    if (!detail.api) {
      this.navigate(detail.redirectUrl || DASHBOARD_ROUTE);
    }

    if (detail.firstLogin) {
      this.onFirstLogin({ email: detail.username });
    }

    this.updateUserInfo();
  }

  onNeedLogin() {
    this.authService.logout();

    this.navigate(ROUTES.login);
  }

  onNavigateTo(event: NavigateEvent) {
    event.stopPropagation();

    this.navigate(event.detail.url, event.detail.state);

    // Scroll to top of page
    window.scrollTo({ top: 0 });
  }

  onUserInfoChange(event: CustomEvent<Partial<CurrentUser>>) {
    // @ts-ignore
    this.userInfo = {
      ...this.userInfo,
      ...event.detail,
    };
  }

  /**
   * Show global toast alert
   */
  onNotify(event: NotifyEvent) {
    event.stopPropagation();

    const {
      title,
      message,
      type = "primary",
      icon = "info-circle",
      duration = 5000,
    } = event.detail;

    const container = document.createElement("sl-alert");
    const alert = Object.assign(container, {
      type: type,
      closable: true,
      duration: duration,
      style: [
        "--sl-panel-background-color: var(--sl-color-neutral-1000)",
        "--sl-color-neutral-700: var(--sl-color-neutral-0)",
        // "--sl-panel-border-width: 0px",
        "--sl-spacing-large: var(--sl-spacing-medium)",
      ].join(";"),
    });

    render(
      html`
        <sl-icon name="${icon}" slot="icon"></sl-icon>
        ${title ? html`<strong>${title}</strong>` : ""}
        ${message ? html`<div>${message}</div>` : ""}
      `,
      container
    );
    document.body.append(alert);
    alert.toast();
  }

  getUserInfo() {
    return this.apiFetch("/users/me", this.authService.authState!);
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
          <p class="mt-8 text-2xl font-medium">
            ${msg("Welcome to Browsertrix Cloud!")}
          </p>

          <p>
            ${msg(html`A confirmation email was sent to: <br />
              <strong>${email}</strong>.`)}
          </p>
          <p class="max-w-xs mx-auto">
            ${msg(
              "Click the link in your email to confirm your email address."
            )}
          </p>
        </div>

        <div class="mb-4 mt-8 text-center">
          <sl-button type="primary" @click=${() => this.closeDialog()}
            >${msg("Got it, go to dashboard")}</sl-button
          >
        </div>
      `,
    });
  }
}

customElements.define("browsertrix-app", App);
