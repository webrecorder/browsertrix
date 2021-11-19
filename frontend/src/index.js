import { LiteElement, APIRouter, html } from "./utils";

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

// ===========================================================================
class LogIn extends LiteElement {
  constructor() {
    super();
    this.loginError = "";
  }

  static get properties() {
    return {
      loginError: { type: String },
    };
  }

  render() {
    return html`
      <div class="hero min-h-screen bg-blue-400">
        <div
          class="text-center hero-content bg-base-200 shadow-2xl rounded-xl px-16 py-8"
        >
          <div class="max-w-md">
            <form action="" @submit="${this.onSubmit}">
              <div class="form-control">
                <label class="label">
                  <span class="label-text">User</span>
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Username"
                  class="input input-bordered"
                />
              </div>
              <div class="form-control">
                <label class="label">
                  <span class="label-text">Password</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Password"
                  class="input input-bordered"
                />
              </div>
              <div class="form-control py-4">
                <button class="btn btn-primary" type="submit">Log In</button>
              </div>
            </form>
            <div id="login-error" class="text-red-600">${this.loginError}</div>
          </div>
        </div>
      </div>
    `;
  }

  async onSubmit(event) {
    event.preventDefault();

    const username = this.querySelector("#username").value;

    const params = new URLSearchParams();
    params.set("grant_type", "password");
    params.set("username", username);
    params.set("password", this.querySelector("#password").value);

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };

    const resp = await fetch("/api/auth/jwt/login", {
      headers,
      method: "POST",
      body: params.toString(),
    });
    if (resp.status !== 200) {
      this.loginError = "Sorry, invalid credentials";
      return;
    }

    try {
      const data = await resp.json();
      if (data.token_type === "bearer" && data.access_token) {
        const auth = "Bearer " + data.access_token;
        const detail = { auth, username };
        this.dispatchEvent(new CustomEvent("logged-in", { detail }));
      }
    } catch (e) {
      console.error(e);
    }

    if (!this.auth) {
      this.loginError = "Unknown login response";
    }
  }
}

// ===========================================================================
class MyAccount extends LiteElement {
  constructor() {
    super();
    this.archiveList = [];
  }

  static get properties() {
    return {
      authState: { type: Object },
      archiveList: { type: Array },
      id: { type: String },
    };
  }

  async firstUpdated() {
    if (!this.authState) {
      this.dispatchEvent(new CustomEvent("need-login"));
      return;
    }

    const data = await this.apiFetch("/archives", this.authState);
    this.archiveList = data.archives;

    const data2 = await this.apiFetch("/users/me", this.authState);
    this.id = data2.id;
  }

  render() {
    return html`
      <div class="container bg-base-200 m-auto border rounded-lg px-8 py-8">
        <h2 class="text-2xl font-bold">Your Archives</h2>
        ${this.archiveList.map(
          (archive) => html`
            <div
              class="card mt-6 ml-6 border rounded-none border-gray-600 hover:bg-gray-300"
            >
              <div class="card-body">
                <div class="card-title">
                  <span class="mr-4">${archive.name}</span
                  >${this.getAccessValue(archive)}
                </div>
                <div class="card-actions">
                  <a
                    class="btn btn-primary"
                    href="/archive/${archive.id}"
                    @click="${this.navLink}"
                    >View Archive</a
                  >
                </div>
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  getAccessValue(archive) {
    const value = archive.users && archive.users[this.id];
    switch (value) {
      case 40:
        return html`<div class="badge badge-info">Owner</div>`;

      default:
        return "";
    }
  }
}

// ===========================================================================
class Archive extends LiteElement {
  static get properties() {
    return {
      authState: { type: Object },
      aid: { type: String },
      tab: { type: String },
      viewState: { type: Object },
    };
  }

  render() {
    const aid = this.aid;
    const tab = this.tab || "running";
    return html`
      <div
        class="container bg-base-200 m-auto border shadow-xl rounded-lg px-8 py-8"
      >
        <div class="tabs tabs-boxed">
          <a
            href="/archive/${aid}/running"
            class="tab ${tab === "running" ? "tab-active" : ""}"
            @click="${this.navLink}"
            >Crawls Running</a
          >
          <a
            href="/archive/${aid}/finished"
            class="tab ${tab === "finished" ? "tab-active" : ""}"
            @click="${this.navLink}"
            >Finished</a
          >
          <a
            href="/archive/${aid}/configs"
            class="tab ${tab === "configs" ? "tab-active" : ""}"
            @click="${this.navLink}"
            >Crawl Configs</a
          >
        </div>
        ${tab === "configs"
          ? html`<btrix-archive-configs
              .archive=${this}
            ></btrix-archive-configs>`
          : ""}
      </div>
    `;
  }
}

// ===========================================================================
class ArchiveConfigs extends LiteElement {
  static get properties() {
    return {
      archive: { type: Object },
      configs: { type: Array },
    };
  }

  async firstUpdated() {
    const res = await this.apiFetch(
      `/archives/${this.archive.aid}/crawlconfigs`,
      this.archive.authState
    );
    this.configs = res.crawl_configs;
  }

  render() {
    return html`<div>Archive Configs!</div>
      ${this.configs &&
      this.configs.map(
        (config) => html`
          <div>${config.crawlCount} ${config.config.seeds}</div>
        `
      )} `;
  }
}

// ===========================================================================
customElements.define("browsertrix-app", App);
customElements.define("log-in", LogIn);
customElements.define("my-account", MyAccount);
customElements.define("btrix-archive", Archive);
customElements.define("btrix-archive-configs", ArchiveConfigs);
