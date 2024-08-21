import { localized, msg, str } from "@lit/localize";
import type { SlDialog } from "@shoelace-style/shoelace";
import { nothing, render, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import "broadcastchannel-polyfill";
import "./utils/polyfills";

import type { OrgTab } from "./pages/org";
import { ROUTES } from "./routes";
import type { UserInfo, UserOrg } from "./types/user";
import APIRouter, { type ViewState } from "./utils/APIRouter";
import AuthService, {
  type AuthEventDetail,
  type LoggedInEventDetail,
  type NeedLoginEventDetail,
} from "./utils/AuthService";
import { DEFAULT_MAX_SCALE } from "./utils/crawler";
import LiteElement, { html } from "./utils/LiteElement";
import { AppStateService } from "./utils/state";
import { formatAPIUser } from "./utils/user";

import type { NavigateEventDetail } from "@/controllers/navigate";
import type { NotifyEventDetail } from "@/controllers/notify";
import { theme } from "@/theme";
import type { AppSettings } from "@/types/app";
import { type Auth } from "@/types/auth";
import brandLockupColor from "~assets/brand/browsertrix-lockup-color.svg";

import "./shoelace";
import "./components";
import "./features";
import "./pages";
import "./assets/fonts/Inter/inter.css";
import "./assets/fonts/Recursive/recursive.css";
import "./styles.css";

// Make theme CSS available in document
document.adoptedStyleSheets = [theme];

type DialogContent = {
  label?: TemplateResult | string;
  body?: TemplateResult | string;
  noHeader?: boolean;
};

export type APIUser = {
  id: string;
  email: string;
  name: string;
  is_verified: boolean;
  is_superuser: boolean;
  orgs: UserOrg[];
};

@localized()
@customElement("browsertrix-app")
export class App extends LiteElement {
  @property({ type: String })
  version?: string;

  private readonly router = new APIRouter(ROUTES);
  authService = new AuthService();

  @state()
  private viewState!: ViewState;

  @state()
  private globalDialogContent: DialogContent = {};

  @query("#globalDialog")
  private readonly globalDialog!: SlDialog;

  async connectedCallback() {
    let authState: AuthService["authState"] = null;
    try {
      authState = await AuthService.initSessionStorage();
    } catch (e) {
      console.debug(e);
    }
    this.syncViewState();
    if (authState) {
      this.authService.saveLogin(authState);
    }
    this.syncViewState();
    if (authState) {
      void this.updateUserInfo();
    }
    super.connectedCallback();

    this.addEventListener("btrix-navigate", this.onNavigateTo);
    this.addEventListener("btrix-notify", this.onNotify);
    this.addEventListener("btrix-need-login", this.onNeedLogin);
    this.addEventListener("btrix-logged-in", this.onLoggedIn);
    this.addEventListener("btrix-log-out", this.onLogOut);
    window.addEventListener("popstate", () => {
      this.syncViewState();
    });

    this.startSyncBrowserTabs();
    void this.fetchAppSettings();
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("viewState")) {
      if (this.viewState.route === "orgs") {
        this.navigate(this.orgBasePath);
      } else if (
        changedProperties.get("viewState") &&
        this.viewState.route === "org"
      ) {
        this.updateOrgSlugIfNeeded();
      }
    }
  }

  getLocationPathname() {
    return window.location.pathname;
  }

  private syncViewState() {
    const pathname = this.getLocationPathname();

    if (
      this.authService.authState &&
      (pathname === "/log-in" || pathname === "/reset-password")
    ) {
      // Redirect to logged in home page
      this.viewState = this.router.match(this.orgBasePath);
      window.history.replaceState(this.viewState, "", this.viewState.pathname);
    } else {
      this.viewState = this.router.match(
        `${pathname}${window.location.search}`,
      );
      this.updateOrgSlugIfNeeded();
    }
  }

  private updateOrgSlugIfNeeded() {
    const slug = this.viewState.params.slug || null;
    if (this.viewState.route === "org" && slug !== this.appState.orgSlug) {
      AppStateService.updateOrgSlug(slug);
    }
  }

  private async fetchAppSettings() {
    const settings = await this.getAppSettings();

    AppStateService.updateSettings(settings);
  }

  /**
   * @deprecate Components should update user info directly through `AppStateService`
   */
  private async updateUserInfo(e?: CustomEvent) {
    if (e) {
      e.stopPropagation();
    }
    try {
      const userInfo = await this.getUserInfo();
      AppStateService.updateUserInfo(formatAPIUser(userInfo));
      const orgs = userInfo.orgs;

      if (
        orgs.length &&
        !this.userInfo!.isSuperAdmin &&
        !this.appState.orgSlug
      ) {
        const firstOrg = orgs[0].slug;
        AppStateService.updateOrgSlug(firstOrg);
      }
    } catch (err) {
      if ((err as Error | null | undefined)?.message === "Unauthorized") {
        console.debug(
          "Unauthorized with authState:",
          this.authService.authState,
        );
        this.clearUser();
        this.navigate(ROUTES.login);
      }
    }
  }

  async getAppSettings(): Promise<AppSettings> {
    const resp = await fetch("/api/settings", {
      headers: { "Content-Type": "application/json" },
    });

    if (resp.status === 200) {
      const body = (await resp.json()) as AppSettings;

      return body;
    } else {
      console.debug(resp);

      return {
        registrationEnabled: false,
        jwtTokenLifetime: 0,
        defaultBehaviorTimeSeconds: 0,
        defaultPageLoadTimeSeconds: 0,
        maxPagesPerCrawl: 0,
        maxScale: 0,
        billingEnabled: false,
        salesEmail: "",
        supportEmail: "",
      };
    }
  }

  navigate(
    newViewPath: string,
    state?: { [key: string]: unknown },
    replace?: boolean,
  ) {
    let url;

    if (newViewPath.startsWith("http")) {
      url = new URL(newViewPath);
    } else {
      url = new URL(
        `${window.location.origin}/${newViewPath.replace(/^\//, "")}`,
      );
    }

    // Remove hash from path for matching
    newViewPath = `${url.pathname}${url.search}`;

    if (newViewPath === "/log-in" && this.authService.authState) {
      // Redirect to logged in home page
      this.viewState = this.router.match(this.orgBasePath);
    } else {
      this.viewState = this.router.match(newViewPath);
    }

    this.viewState.data = state;
    const urlStr = `${this.viewState.pathname.replace(url.search, "")}${url.hash}${
      url.search
    }`;

    if (replace) {
      window.history.replaceState(this.viewState, "", urlStr);
    } else {
      window.history.pushState(this.viewState, "", urlStr);
    }
  }

  render() {
    return html`
      <div class="min-w-screen flex min-h-screen flex-col">
        ${this.renderNavBar()} ${this.renderAlertBanner()}
        <main class="relative flex flex-auto">${this.renderPage()}</main>
        <div class="border-t border-neutral-100">${this.renderFooter()}</div>
      </div>

      <sl-dialog
        id="globalDialog"
        ?noHeader=${this.globalDialogContent.noHeader === true}
        label=${this.globalDialogContent.label || msg("Message")}
        @sl-after-hide=${() => (this.globalDialogContent = {})}
        >${this.globalDialogContent.body}</sl-dialog
      >
    `;
  }

  private renderAlertBanner() {
    if (this.userInfo?.orgs && !this.userInfo.orgs.length) {
      return this.renderNoOrgsBanner();
    }
  }

  private renderNoOrgsBanner() {
    return html`
      <div class="border-b bg-slate-100 py-5">
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
          <sl-alert variant="warning" open>
            <sl-icon slot="icon" name="exclamation-triangle-fill"></sl-icon>
            <strong class="block font-semibold">
              ${msg("Your account isn't quite set up yet")}
            </strong>
            ${msg(
              "You must belong to at least one org in order to access Browsertrix features.",
            )}
            ${this.appState.settings?.salesEmail
              ? msg(
                  str`If you haven't received an invitation to an org, please contact us at ${this.appState.settings.salesEmail}.`,
                )
              : msg(
                  str`If you haven't received an invitation to an org, please contact your Browsertrix administrator.`,
                )}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderNavBar() {
    const isSuperAdmin = this.userInfo?.isSuperAdmin;
    let homeHref = "/";
    if (!isSuperAdmin && this.appState.orgSlug) {
      homeHref = this.orgBasePath;
    }

    const showFullLogo =
      this.viewState.route === "login" || !this.authService.authState;

    return html`
      <div class="border-b bg-neutral-50">
        <nav
          class="mx-auto box-border flex h-12 items-center justify-between px-3 xl:pl-6"
        >
          <div class="flex items-center">
            <a
              class="items-between flex gap-2"
              aria-label="home"
              href=${homeHref}
              @click=${(e: MouseEvent) => {
                if (isSuperAdmin) {
                  this.clearSelectedOrg();
                }
                this.navLink(e);
              }}
            >
              <div
                class="${showFullLogo
                  ? "w-[10.5rem]"
                  : "w-6 md:w-[10.5rem]"} h-6 bg-cover bg-no-repeat"
                style="background-image: url(${brandLockupColor})"
                role="img"
                title="Browsertrix logo"
              ></div>
            </a>
            ${when(
              this.authService.authState,
              () => html`
                ${isSuperAdmin
                  ? html`
                      <div
                        role="separator"
                        class="mx-2.5 h-6 w-0 border-l"
                      ></div>
                      <a
                        class="flex items-center gap-2 font-medium text-primary-700 transition-colors hover:text-primary"
                        href="/"
                        @click=${(e: MouseEvent) => {
                          this.clearSelectedOrg();
                          this.navLink(e);
                        }}
                      >
                        <sl-icon
                          class="text-lg"
                          name="house-gear-fill"
                        ></sl-icon>
                        ${msg("Admin")}</a
                      >
                    `
                  : nothing}
                <div role="separator" class="mx-2.5 h-7 w-0 border-l"></div>
                ${this.renderOrgs()}
              `,
            )}
          </div>
          <div class="grid auto-cols-max grid-flow-col items-center gap-5">
            ${isSuperAdmin
              ? html`
                  <a
                    class="font-medium text-neutral-500 hover:text-primary"
                    href="/crawls"
                    @click=${this.navLink}
                    >${msg("Running Crawls")}</a
                  >
                  <div class="hidden md:block">${this.renderFindCrawl()}</div>
                `
              : ""}
            ${this.authService.authState
              ? html`<sl-dropdown placement="bottom-end" distance="4">
                  <button slot="trigger">
                    <sl-avatar
                      label=${msg("Open user menu")}
                      shape="rounded"
                      class="[--size:1.75rem]"
                    ></sl-avatar>
                  </button>
                  <sl-menu class="w-60 min-w-min max-w-full">
                    <div class="px-7 py-2">${this.renderMenuUserInfo()}</div>
                    <sl-divider></sl-divider>
                    <sl-menu-item
                      @click=${() => this.navigate(ROUTES.accountSettings)}
                    >
                      <sl-icon slot="prefix" name="person-gear"></sl-icon>
                      ${msg("Account Settings")}
                    </sl-menu-item>
                    ${this.userInfo?.isSuperAdmin
                      ? html` <sl-menu-item
                          @click=${() => this.navigate(ROUTES.usersInvite)}
                        >
                          <sl-icon slot="prefix" name="person-plus"></sl-icon>
                          ${msg("Invite Users")}
                        </sl-menu-item>`
                      : ""}
                    <sl-divider></sl-divider>
                    <sl-menu-item @click="${this.onLogOut}">
                      <sl-icon slot="prefix" name="door-open"></sl-icon>
                      ${msg("Log Out")}
                    </sl-menu-item>
                  </sl-menu>
                </sl-dropdown>`
              : html`
                  <a href="/log-in"> ${msg("Log In")} </a>
                  ${this.appState.settings?.registrationEnabled
                    ? html`
                        <sl-button
                          variant="text"
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

  private renderOrgs() {
    const orgs = this.userInfo?.orgs;
    if (!orgs) return;

    const selectedOption = this.orgSlug
      ? orgs.find(({ slug }) => slug === this.orgSlug)
      : { slug: "", name: msg("All Organizations") };
    if (!selectedOption) {
      console.debug(
        `Couldn't find organization with slug ${this.orgSlug}`,
        orgs,
      );
      return;
    }

    // Limit org name display for orgs created before org name max length restriction
    const orgNameLength = 50;

    return html`
      ${selectedOption.slug
        ? html`
            <a
              class="font-medium text-neutral-600"
              href=${this.orgBasePath}
              @click=${this.navLink}
            >
              ${selectedOption.name.slice(0, orgNameLength)}
            </a>
          `
        : html`
            <span class="text-neutral-500">
              ${selectedOption.name.slice(0, orgNameLength)}
            </span>
          `}
      ${when(
        orgs.length > 1,
        () => html`
          <sl-dropdown placement="bottom-end">
            <sl-icon-button
              slot="trigger"
              name="chevron-expand"
              label=${msg("Expand org list")}
            ></sl-icon-button>
            <sl-menu
              @sl-select=${(e: CustomEvent<{ item: { value: string } }>) => {
                const { value } = e.detail.item;
                if (value) {
                  this.navigate(`/orgs/${value}`);
                } else {
                  if (this.userInfo) {
                    this.clearSelectedOrg();
                  }
                  this.navigate(`/`);
                }
              }}
            >
              ${when(
                this.userInfo?.isSuperAdmin,
                () => html`
                  <sl-menu-item
                    type="checkbox"
                    value=""
                    ?checked=${!selectedOption.slug}
                    >${msg("All Organizations")}</sl-menu-item
                  >
                  <sl-divider></sl-divider>
                `,
              )}
              ${orgs.map(
                (org) => html`
                  <sl-menu-item
                    type="checkbox"
                    value=${org.slug}
                    ?checked=${org.slug === selectedOption.slug}
                    >${org.name.slice(0, orgNameLength)}</sl-menu-item
                  >
                `,
              )}
            </sl-menu>
          </sl-dropdown>
        `,
      )}
    `;
  }

  private renderMenuUserInfo() {
    if (!this.userInfo) return;
    if (this.userInfo.isSuperAdmin) {
      return html`
        <div class="mb-2">
          <btrix-tag>${msg("Admin")}</btrix-tag>
        </div>
        <div class="font-medium text-neutral-700">${this.userInfo.name}</div>
        <div class="whitespace-nowrap text-xs text-neutral-500">
          ${this.userInfo.email}
        </div>
      `;
    }

    const orgs = this.userInfo.orgs;
    if (orgs.length === 1) {
      return html`
        <div class="my-1 font-medium text-neutral-700">${orgs[0].name}</div>
        <div class="text-neutral-500">${this.userInfo.name}</div>
        <div class="whitespace-nowrap text-xs text-neutral-500">
          ${this.userInfo.email}
        </div>
      `;
    }

    return html`
      <div class="font-medium text-neutral-700">${this.userInfo.name}</div>
      <div class="whitespace-nowrap text-xs text-neutral-500">
        ${this.userInfo.email}
      </div>
    `;
  }

  private renderFooter() {
    return html`
      <footer
        class="mx-auto box-border flex w-full max-w-screen-desktop flex-col justify-between gap-4 p-3 md:flex-row"
      >
        <!-- <div> -->
        <!-- TODO re-enable when translations are added -->
        <!-- <btrix-locale-picker></btrix-locale-picker> -->
        <!-- </div> -->
        <div class="flex items-center justify-center">
          <a
            class="flex items-center gap-2 text-neutral-400 hover:text-primary"
            href="https://github.com/webrecorder/browsertrix"
            target="_blank"
            rel="noopener"
          >
            <sl-icon
              name="github"
              class="inline-block size-4 align-middle text-base"
            ></sl-icon>
            ${msg("Source Code")}
          </a>
        </div>
        <div class="flex items-center justify-center">
          <a
            class="flex items-center gap-2 text-neutral-400 hover:text-primary"
            href="https://docs.browsertrix.com"
            target="_blank"
            rel="noopener"
          >
            <sl-icon
              name="book-half"
              class="inline-block size-4 align-middle text-base"
            ></sl-icon>
            ${msg("Documentation")}
          </a>
        </div>
        <div class="flex items-center justify-center">
          ${this.version
            ? html`
                <btrix-copy-button
                  class="mr-2 size-4 text-neutral-400"
                  .getValue=${() => this.version}
                  content=${msg("Copy Version Code")}
                  size="x-small"
                ></btrix-copy-button>
                <span
                  class="font-monostyle inline-block align-middle text-xs text-neutral-400"
                >
                  ${this.version}
                </span>
              `
            : ""}
        </div>
      </footer>
    `;
  }

  private renderPage() {
    switch (this.viewState.route) {
      case "signUp": {
        if (!this.appState.settings) {
          return nothing;
        }
        if (this.appState.settings.registrationEnabled) {
          return html`<btrix-sign-up
            class="flex w-full items-center justify-center md:bg-neutral-50"
          ></btrix-sign-up>`;
        } else {
          return this.renderNotFoundPage();
        }
      }

      case "verify":
        return html`<btrix-verify
          class="flex w-full items-center justify-center md:bg-neutral-50"
          token="${this.viewState.params.token}"
          @user-info-change="${this.onUserInfoChange}"
        ></btrix-verify>`;

      case "join":
        return html`<btrix-join
          class="flex w-full items-center justify-center md:bg-neutral-50"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-join>`;

      case "acceptInvite":
        return html`<btrix-accept-invite
          class="flex w-full items-center justify-center md:bg-neutral-50"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-accept-invite>`;

      case "login":
      case "loginWithRedirect":
      case "forgotPassword":
        return html`<btrix-log-in
          class="flex w-full items-center justify-center md:bg-neutral-50"
          .viewState=${this.viewState}
          redirectUrl=${this.viewState.params.redirectUrl ||
          this.viewState.data?.redirectUrl}
        ></btrix-log-in>`;

      case "resetPassword":
        return html`<btrix-reset-password
          class="flex w-full items-center justify-center md:bg-neutral-50"
          .viewState=${this.viewState}
        ></btrix-reset-password>`;

      case "home":
        return html`<btrix-home class="w-full md:bg-neutral-50"></btrix-home>`;

      case "orgs":
        return html`<btrix-orgs class="w-full md:bg-neutral-50"></btrix-orgs>`;

      case "org": {
        const slug = this.viewState.params.slug;
        const orgPath = this.viewState.pathname;
        const pathname = this.getLocationPathname();
        const orgTab =
          pathname
            .slice(pathname.indexOf(slug) + slug.length)
            .replace(/(^\/|\/$)/, "")
            .split("/")[0] || "home";
        return html`<btrix-org
          class="w-full"
          .viewStateData=${this.viewState.data}
          .params=${this.viewState.params}
          .maxScale=${this.appState.settings?.maxScale || DEFAULT_MAX_SCALE}
          slug=${slug}
          orgPath=${orgPath.split(slug)[1]}
          orgTab=${orgTab as OrgTab}
        ></btrix-org>`;
      }

      case "accountSettings":
        return html`<btrix-account-settings
          class="mx-auto box-border w-full max-w-screen-desktop p-2 md:py-8"
        ></btrix-account-settings>`;

      case "usersInvite": {
        if (this.userInfo) {
          if (this.userInfo.isSuperAdmin) {
            return html`<btrix-users-invite
              class="mx-auto box-border w-full max-w-screen-desktop p-2 md:py-8"
            ></btrix-users-invite>`;
          } else {
            return this.renderNotFoundPage();
          }
        } else {
          return this.renderSpinner();
        }
      }

      case "crawls":
      case "crawl": {
        if (this.userInfo) {
          if (this.userInfo.isSuperAdmin) {
            return html`<btrix-crawls
              class="w-full"
              @notify=${this.onNotify}
              crawlId=${this.viewState.params.crawlId}
            ></btrix-crawls>`;
          } else {
            return this.renderNotFoundPage();
          }
        } else {
          return this.renderSpinner();
        }
      }

      case "awpUploadRedirect": {
        const { orgId, uploadId } = this.viewState.params;
        const slug = this.userInfo?.orgs.find((org) => org.id === orgId)?.slug;
        if (slug) {
          this.navigate(`/orgs/${slug}/items/upload/${uploadId}`);
          return;
        }
        // falls through
      }

      case "components":
        return html`<btrix-components></btrix-components>`;

      default:
        return this.renderNotFoundPage();
    }
  }

  private renderSpinner() {
    return html`
      <div class="flex w-full items-center justify-center text-3xl">
        <sl-spinner></sl-spinner>
      </div>
    `;
  }

  private renderNotFoundPage() {
    return html`<btrix-not-found
      class="flex w-full items-center justify-center md:bg-neutral-50"
    ></btrix-not-found>`;
  }

  private renderFindCrawl() {
    return html`
      <sl-dropdown
        @sl-after-show=${(e: Event) => {
          (e.target as HTMLElement).querySelector("sl-input")?.focus();
        }}
        @sl-after-hide=${(e: Event) => {
          (e.target as HTMLElement).querySelector("sl-input")!.value = "";
        }}
        hoist
      >
        <button
          slot="trigger"
          class="font-medium text-primary-700 hover:text-primary"
        >
          ${msg("Jump to Crawl")}
        </button>

        <div class="p-2">
          <form
            @submit=${(e: SubmitEvent) => {
              e.preventDefault();
              const id = new FormData(e.target as HTMLFormElement).get(
                "crawlId",
              ) as string;
              this.navigate(`/crawls/crawl/${id}#watch`);
              void (e.target as HTMLFormElement).closest("sl-dropdown")?.hide();
            }}
          >
            <div class="flex flex-wrap items-center">
              <div class="w-90 mr-2">
                <sl-input
                  size="small"
                  name="crawlId"
                  placeholder=${msg("Enter Crawl ID")}
                  required
                ></sl-input>
              </div>
              <div class="grow-0">
                <sl-button size="small" variant="neutral" type="submit">
                  <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
                  ${msg("Go")}</sl-button
                >
              </div>
            </div>
          </form>
        </div>
      </sl-dropdown>
    `;
  }

  onLogOut(event: CustomEvent<{ redirect?: boolean } | null>) {
    const detail = event.detail || {};
    const redirect = detail.redirect !== false;

    this.clearUser();

    if (redirect) {
      this.navigate(ROUTES.login);
    }
  }

  onLoggedIn(event: CustomEvent<LoggedInEventDetail>) {
    const { detail } = event;

    this.authService.saveLogin({
      username: detail.username,
      headers: detail.headers,
      tokenExpiresAt: detail.tokenExpiresAt,
    });

    if (!detail.api) {
      this.navigate(detail.redirectUrl || this.orgBasePath);
    }

    if (detail.firstLogin) {
      this.onFirstLogin({ email: detail.username });
    }

    void this.updateUserInfo();
  }

  onNeedLogin = (e: CustomEvent<NeedLoginEventDetail>) => {
    e.stopPropagation();

    this.clearUser();
    const redirectUrl = e.detail.redirectUrl;
    this.navigate(ROUTES.login, {
      redirectUrl,
    });
    if (redirectUrl && redirectUrl !== "/") {
      this.notify({
        message: msg("Please log in to continue."),
        variant: "warning",
        icon: "exclamation-triangle",
      });
    }
  };

  onNavigateTo = (event: CustomEvent<NavigateEventDetail>) => {
    event.stopPropagation();

    const { url, state, resetScroll, replace } = event.detail;

    this.navigate(url, state, replace);

    if (resetScroll) {
      // Scroll to top of page
      window.scrollTo({ top: 0 });
    }
  };

  onUserInfoChange(event: CustomEvent<Partial<UserInfo>>) {
    AppStateService.updateUserInfo({
      ...this.userInfo,
      ...event.detail,
    } as UserInfo);
  }

  /**
   * Show global toast alert
   */
  onNotify = (event: CustomEvent<NotifyEventDetail>) => {
    event.stopPropagation();

    const {
      title,
      message,
      variant = "primary",
      icon = "info-circle",
      duration = 5000,
    } = event.detail;

    const container = document.createElement("sl-alert");
    const alert = Object.assign(container, {
      variant,
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
      container,
    );
    document.body.append(alert);
    void alert.toast();
  };

  async getUserInfo(): Promise<APIUser> {
    return this.apiFetch("/users/me");
  }

  private clearUser() {
    this.authService.logout();
    this.authService = new AuthService();
    AppStateService.resetUser();
  }

  private showDialog(content: DialogContent) {
    this.globalDialogContent = content;
    void this.globalDialog.show();
  }

  private closeDialog() {
    void this.globalDialog.hide();
  }

  private onFirstLogin({ email }: { email: string }) {
    this.showDialog({
      label: "Welcome to Browsertrix",
      noHeader: true,
      body: html`
        <div class="grid gap-4 text-center">
          <p class="mt-8 text-xl font-medium">
            ${msg("Welcome to Browsertrix!")}
          </p>

          <p>
            ${msg(
              html`A confirmation email was sent to: <br />
                <strong>${email}</strong>.`,
            )}
          </p>
          <p class="mx-auto max-w-xs">
            ${msg(
              "Click the link in your email to confirm your email address.",
            )}
          </p>
        </div>

        <div class="mb-4 mt-8 text-center">
          <sl-button variant="primary" @click=${() => this.closeDialog()}
            >${msg("Got it, go to dashboard")}</sl-button
          >
        </div>
      `,
    });
  }

  private startSyncBrowserTabs() {
    AuthService.broadcastChannel.addEventListener(
      "message",
      ({ data }: { data: AuthEventDetail }) => {
        if (data.name === "auth_storage") {
          if (data.value !== AuthService.storage.getItem()) {
            if (data.value) {
              this.authService.saveLogin(JSON.parse(data.value) as Auth);
              void this.updateUserInfo();
              this.syncViewState();
            } else {
              this.clearUser();
              this.navigate(ROUTES.login);
            }
          }
        }
      },
    );
  }

  private clearSelectedOrg() {
    AppStateService.updateOrgSlug(null);
  }
}
