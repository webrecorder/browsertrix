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

// ===========================================================================
export class App extends LiteElement {
  authState: AuthState | null;
  router: APIRouter;
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

    this.authState = null;

    const authState = window.localStorage.getItem("authState");
    if (authState) {
      this.authState = JSON.parse(authState);
    }

    this.router = new APIRouter({
      home: "/",
      login: "/log-in",
      "my-account": "/my-account",
      "archive-info": "/archive/:aid",
      "archive-info-tab": "/archive/:aid/:tab",
    });

    this.viewState = this.router.match(window.location.pathname);
  }

  static get properties() {
    return {
      viewState: { type: Object },
      authState: { type: Object },
    };
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
    this.viewState = this.router.match(newView);
    if (this.viewState._route === "login") {
      this.clearAuthState();
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
      ${this.renderNavBar()}
      <div class="w-full h-full px-12 py-12">${this.renderPage()}</div>
      <footer class="flex justify-center p-4">
        <locale-picker></locale-picker>
      </footer>
    `;
  }

  renderNavBar() {
    return html`
      <style>
        ${theme}
      </style>

      <div
        class="flex p-2 items-center shadow-lg bg-white text-neutral-content"
      >
        <div class="flex-1 px-2 mx-2">
          <a href="/" class="text-lg font-bold" @click="${this.navLink}"
            >${msg("Browsertrix Cloud")}</a
          >
        </div>
        <div class="flex-none">
          ${this.authState
            ? html` <a
                  class="font-bold px-4"
                  href="/my-account"
                  @click="${this.navLink}"
                  >${msg("My Account")}</a
                >
                <button class="btn btn-error" @click="${this.onLogOut}">
                  ${msg("Log Out")}
                </button>`
            : html`
                <sl-button type="primary" @click="${this.onNeedLogin}">
                  ${msg("Log In")}
                </sl-button>
              `}
        </div>
      </div>
    `;
  }

  renderPage() {
    switch (this.viewState._route) {
      case "login":
        return html`<log-in @logged-in="${this.onLoggedIn}"></log-in>`;

      case "home":
        return html`<div>Home</div>`;

      case "my-account":
        return html`<my-account
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authState}"
        ></my-account>`;

      case "archive-info":
      case "archive-info-tab":
        return html`<btrix-archive
          @navigate="${this.onNavigateTo}"
          .authState="${this.authState}"
          .viewState="${this.viewState}"
          aid="${this.viewState.aid!}"
          tab="${this.viewState.tab || "running"}"
        ></btrix-archive>`;

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
    this.navigate("/my-account");
  }

  onNeedLogin() {
    this.clearAuthState();
    this.navigate("/log-in");
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
