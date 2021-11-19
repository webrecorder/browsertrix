import { LiteElement, APIRouter, html } from "./utils";

import { LogInPage } from "./pages/log-in";
import { MyAccountPage } from "./pages/my-account";
import { ArchivePage } from "./pages/archive-info";
import { ArchiveConfigsPage } from "./pages/archive-info-tab";

// ===========================================================================
export class App extends LiteElement {
  constructor() {
    super();
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

  navigate(newView) {
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

  navLink(event) {
    event.preventDefault();
    this.navigate(event.currentTarget.href);
  }

  render() {
    return html`
      ${this.renderNavBar()}
      <div class="w-full h-full px-12 py-12">${this.renderPage()}</div>
    `;
  }

  renderNavBar() {
    return html`
      <div class="navbar shadow-lg bg-neutral text-neutral-content">
        <div class="flex-1 px-2 mx-2">
          <a
            href="/"
            class="link link-hover text-lg font-bold"
            @click="${this.navLink}"
            >Browsertrix Cloud</a
          >
        </div>
        <div class="flex-none">
          ${this.authState
            ? html` <a
                  class="link link-hover font-bold px-4"
                  href="/my-account"
                  @click="${this.navLink}"
                  >My Account</a
                >
                <button class="btn btn-error" @click="${this.onLogOut}">
                  Log Out
                </button>`
            : html`
                <button
                  class="btn ${this.viewState._route !== "login"
                    ? "btn-primary"
                    : "btn-ghost"}"
                  @click="${this.onNeedLogin}"
                >
                  Log In
                </button>
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
          aid="${this.viewState.aid}"
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

  onLoggedIn(event) {
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

  onNavigateTo(event) {
    this.navigate(event.detail);
  }

  clearAuthState() {
    this.authState = null;
    window.localStorage.setItem("authState", "");
  }
}

customElements.define("browsertrix-app", App);
customElements.define("log-in", LogInPage);
customElements.define("my-account", MyAccountPage);
customElements.define("btrix-archive", ArchivePage);
customElements.define("btrix-archive-configs", ArchiveConfigsPage);
