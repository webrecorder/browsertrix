import type { TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { msg, updateWhenLocaleChanges } from "@lit/localize";

import "./shoelace";
import { LocalePicker } from "./components/locale-picker";
import { LogInPage } from "./pages/log-in";
import { MyAccountPage } from "./pages/my-account";
import { ArchivePage } from "./pages/archive-info";
import { ArchiveConfigsPage } from "./pages/archive-info-tab";
import LiteElement, { html } from "./utils/LiteElement";
import APIRouter from "./utils/APIRouter";
import type { ViewState, NavigateEvent } from "./utils/APIRouter";
import type { AuthState } from "./types/auth";
import theme from "./theme";

const ROUTES = {
  home: "/",
  login: "/log-in",
  myAccount: "/my-account",
  "archive-info": "/archive/:aid",
  "archive-info-tab": "/archive/:aid/:tab",
} as const;

// ===========================================================================
export class App extends LiteElement {
  router: APIRouter;

  @state()
  authState: AuthState | null = null;

  @state()
  viewState: ViewState & {
    aid?: string;
    // TODO common tab type
    tab?: "running" | "finished" | "configs";
  };

  constructor() {
    super();

    // Note we use updateWhenLocaleChanges here so that we're always up to date with
    // the active locale (the result of getLocale()) when the locale changes via a
    // history navigation.
    updateWhenLocaleChanges(this);

    const authState = window.localStorage.getItem("authState");
    if (authState) {
      this.authState = JSON.parse(authState);
    }

    this.router = new APIRouter(ROUTES);

    this.viewState = this.router.match(window.location.pathname);
  }

  firstUpdated() {
    window.addEventListener("popstate", (event) => {
      // if (event.state.view) {
      //   this.view = event.state.view;
      // }
      this.viewState = this.router.match(window.location.pathname);
    });

    this.viewState = this.router.match(window.location.pathname);
  }

  navigate(newView: string) {
    if (newView.startsWith("http")) {
      newView = new URL(newView).pathname;
    }

    if (newView === "/log-in" && this.authState) {
      // Redirect to logged in home page
      this.viewState = this.router.match(ROUTES.myAccount);
    } else {
      this.viewState = this.router.match(newView);
    }

    //console.log(this.view._route, window.location.href);
    window.history.pushState(this.viewState, "", this.viewState._path);
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
          <locale-picker></locale-picker>
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
        <div>
          ${this.authState
            ? html` <sl-dropdown>
                <div class="p-2" role="button" slot="trigger">
                  ${this.authState.username}
                  <span class="text-xs"
                    ><sl-icon name="chevron-down"></sl-icon
                  ></span>
                </div>
                <sl-menu>
                  <sl-menu-item>Your account</sl-menu-item>
                  <sl-menu-item @click="${this.onLogOut}"
                    >${msg("Log Out")}</sl-menu-item
                  >
                </sl-menu>
              </sl-dropdown>`
            : html` <a href="/log-in"> ${msg("Log In")} </a> `}
        </div>
      </nav>
    `;
  }

  renderPage() {
    const navLink = ({ href, label }: { href: string; label: string }) => html`
      <li>
        <a
          class="block p-2 ${href === this.viewState._path
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
        ${template}
      </div>
    `;

    switch (this.viewState._route) {
      case "login":
        return html`<log-in
          class="w-full md:bg-gray-100 flex items-center justify-center"
          @navigate="${this.onNavigateTo}"
          @logged-in="${this.onLoggedIn}"
          .authState="${this.authState}"
        ></log-in>`;

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

      case "archive-info":
      case "archive-info-tab":
        return appLayout(html`<btrix-archive
          class="w-full"
          @navigate="${this.onNavigateTo}"
          .authState="${this.authState}"
          .viewState="${this.viewState}"
          aid="${this.viewState.aid!}"
          tab="${this.viewState.tab || "running"}"
        ></btrix-archive>`);

      default:
        return html`<div>Not Found!</div>`;
    }
  }

  onLogOut() {
    this.clearAuthState();
    this.navigate("/");
  }

  onLoggedIn(event: CustomEvent<{ auth: string; username: string }>) {
    this.authState = {
      username: event.detail.username,
      headers: { Authorization: event.detail.auth },
    };
    window.localStorage.setItem("authState", JSON.stringify(this.authState));
    this.navigate(ROUTES.myAccount);
  }

  onNeedLogin() {
    this.clearAuthState();
    this.navigate(ROUTES.login);
  }

  onNavigateTo(event: NavigateEvent) {
    this.navigate(event.detail);
  }

  clearAuthState() {
    this.authState = null;
    window.localStorage.setItem("authState", "");
  }
}

customElements.define("locale-picker", LocalePicker);
customElements.define("browsertrix-app", App);
customElements.define("log-in", LogInPage);
customElements.define("my-account", MyAccountPage);
customElements.define("btrix-archive", ArchivePage);
customElements.define("btrix-archive-configs", ArchiveConfigsPage);
