import "./utils/polyfills";
import "./global";

import { provide } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import type {
  SlDialog,
  SlDrawer,
  SlSelectEvent,
} from "@shoelace-style/shoelace";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";
import isEqual from "lodash/fp/isEqual";

import "./components";
import "./features";
import "./pages";

import { viewStateContext } from "./context/view-state";
import { OrgTab, RouteNamespace } from "./routes";
import type { UserInfo, UserOrg } from "./types/user";
import { pageView, type AnalyticsTrackProps } from "./utils/analytics";
import { type ViewState } from "./utils/APIRouter";
import AuthService, {
  type AuthEventDetail,
  type LoggedInEventDetail,
  type NeedLoginEventDetail,
} from "./utils/AuthService";

import { BtrixElement } from "@/classes/BtrixElement";
import type { NavigateEventDetail } from "@/controllers/navigate";
import type { NotifyEventDetail } from "@/controllers/notify";
import { type Auth } from "@/types/auth";
import {
  translatedLocales,
  type TranslatedLocaleEnum,
} from "@/types/localization";
import { type AppSettings } from "@/utils/app";
import { DEFAULT_MAX_SCALE } from "@/utils/crawler";
import localize from "@/utils/localize";
import { toast } from "@/utils/notify";
import router, { urlForName } from "@/utils/router";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";
import brandLockupColor from "~assets/brand/browsertrix-lockup-color.svg";

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

export interface UserGuideEventMap {
  "btrix-user-guide-show": CustomEvent<{ path?: string }>;
}

@customElement("browsertrix-app")
@localized()
export class App extends BtrixElement {
  /**
   * Browsertrix app version to display in the UI
   */
  @property({ type: String })
  version?: string;

  /**
   * Base URL for user guide documentation
   */
  @property({ type: String })
  docsUrl = "/docs/";

  /**
   * App settings from `/api/settings`
   */
  @property({ type: Object })
  settings?: AppSettings;

  // TODO Refactor into context
  private readonly router = router;

  authService = new AuthService();

  @provide({ context: viewStateContext })
  @state()
  private viewState!: ViewState;

  @state()
  private fullDocsUrl = "/docs/";

  @state()
  private globalDialogContent: DialogContent = {};

  @query("#globalDialog")
  private readonly globalDialog!: SlDialog;

  @query("#userGuideDrawer")
  private readonly userGuideDrawer!: SlDrawer;

  get orgSlugInPath() {
    return this.viewState.params.slug || "";
  }

  private get homePath() {
    let path = "/log-in";
    if (this.authState) {
      if (this.userInfo?.isSuperAdmin) {
        path = `/${RouteNamespace.Superadmin}`;
      } else if (this.appState.orgSlug) {
        path = `${this.navigate.orgBasePath}/${OrgTab.Dashboard}`;
      } else if (this.userInfo?.orgs[0]) {
        path = `/${RouteNamespace.PrivateOrgs}/${this.userInfo.orgs[0].slug}/${OrgTab.Dashboard}`;
      } else {
        path = "/account/settings";
      }
    }
    return path;
  }

  get isUserInCurrentOrg(): boolean {
    const slug = this.orgSlugInPath;
    if (!this.userInfo || !slug) return false;
    return Boolean(this.userInfo.orgs.some((org) => org.slug === slug));
  }

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
    if (authState && !this.userInfo) {
      void this.fetchAndUpdateUserInfo();
    }

    super.connectedCallback();

    this.addEventListener("btrix-navigate", this.onNavigateTo);
    this.addEventListener("btrix-notify", this.onNotify);
    this.addEventListener("btrix-need-login", this.onNeedLogin);
    this.addEventListener("btrix-logged-in", this.onLoggedIn);
    this.addEventListener("btrix-log-out", this.onLogOut);
    this.attachUserGuideListeners();
    window.addEventListener("popstate", () => {
      this.syncViewState();
    });

    this.startSyncBrowserTabs();
  }

  private attachUserGuideListeners() {
    this.addEventListener(
      "btrix-user-guide-show",
      (e: UserGuideEventMap["btrix-user-guide-show"]) => {
        e.stopPropagation();
        this.showUserGuide(e.detail.path);
      },
    );
  }

  firstUpdated() {
    void this.initTranslation();
    this.trackPageView();
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("settings")) {
      AppStateService.updateSettings(this.settings || null);
    }
    if (changedProperties.has("viewState")) {
      this.handleViewStateChange(
        changedProperties.get("viewState") as undefined | ViewState,
      );
    }
  }

  private handleViewStateChange(prevValue?: ViewState) {
    switch (this.viewState.route) {
      case "orgs":
        // Orgs index page don't exist right now
        this.routeTo(this.navigate.orgBasePath);
        break;
      case "publicOrgs":
        // Public index page don't exist right now
        this.routeTo("/");
        break;
      case "org": {
        if (prevValue) {
          this.updateOrgSlugIfNeeded();
        }
        break;
      }
      case "home":
        // Redirect base URL
        this.routeTo(this.homePath);
        break;
      default:
        break;
    }
  }

  async initTranslation() {
    await localize.initLanguage();
    // TODO We might want to set this in a lit-localize-status event listener
    // see https://lit.dev/docs/localization/runtime-mode/#example-of-using-the-status-event
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
      this.viewState = this.router.match(this.navigate.orgBasePath);
      window.history.replaceState(this.viewState, "", this.viewState.pathname);
    } else {
      const nextViewState = this.router.match(
        `${pathname}${window.location.search}`,
      );
      if (
        !(this.viewState as unknown) ||
        this.viewState.pathname !== nextViewState.pathname ||
        !isEqual(this.viewState.params, nextViewState.params)
      ) {
        this.viewState = nextViewState;
        this.updateOrgSlugIfNeeded();
      }
    }
  }

  private updateOrgSlugIfNeeded() {
    const slug = this.viewState.params.slug || null;
    if (
      this.isUserInCurrentOrg &&
      this.viewState.route === "org" &&
      slug !== this.appState.orgSlug
    ) {
      AppStateService.updateOrgSlug(slug);
    }
  }

  private async fetchAndUpdateUserInfo(e?: CustomEvent) {
    if (e) {
      e.stopPropagation();
    }
    try {
      const user = await this.getUserInfo();

      AppStateService.updateUser(formatAPIUser(user));
    } catch (err) {
      if ((err as Error | null | undefined)?.message === "Unauthorized") {
        console.debug(
          "Unauthorized with authState:",
          this.authService.authState,
        );
        this.clearUser();
        this.routeTo(urlForName("login"));
      }
    }
  }

  routeTo(
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
      this.viewState = this.router.match(this.navigate.orgBasePath);
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

    this.trackPageView();
  }

  trackPageView() {
    const { slug, collectionSlug } = this.viewState.params;
    const pageViewProps: AnalyticsTrackProps = {
      org_slug: slug || null,
      logged_in: !!this.authState,
    };

    if (collectionSlug) {
      pageViewProps.collection_slug = collectionSlug;
    }

    pageView(pageViewProps);
  }

  render() {
    return html`
      <div class="min-w-screen relative flex min-h-screen flex-col">
        ${this.renderSuperadminBanner()} ${this.renderNavBar()}
        ${this.renderAlertBanner()}
        <main
          class="relative flex flex-auto transition-[padding] md:min-h-[calc(100vh-3.125rem)]"
        >
          ${this.renderPage()}
        </main>
        <div class="border-t border-neutral-100">${this.renderFooter()}</div>
      </div>

      <sl-dialog
        id="globalDialog"
        ?noHeader=${this.globalDialogContent.noHeader === true}
        label=${this.globalDialogContent.label || msg("Message")}
        @sl-after-hide=${() => (this.globalDialogContent = {})}
        >${this.globalDialogContent.body}</sl-dialog
      >

      <sl-drawer
        id="userGuideDrawer"
        label=${msg("User Guide")}
        class="[--body-spacing:0] [--footer-spacing:var(--sl-spacing-2x-small)] [--size:31rem] part-[base]:fixed part-[base]:z-50 part-[panel]:[border-left:1px_solid_var(--sl-panel-border-color)]"
        ?open=${this.appState.userGuideOpen}
        contained
        @sl-hide=${() => AppStateService.updateUserGuideOpen(false)}
        @sl-after-hide=${() => {
          // FIXME There might be a way to handle this in Mkdocs, but updating
          // only the hash doesn't seem to update the docs view
          const iframe = this.userGuideDrawer.querySelector("iframe");

          if (!iframe) return;

          const src = iframe.src;
          iframe.src = src.slice(0, src.indexOf("#"));
        }}
      >
        <span slot="label" class="flex items-center gap-3">
          <sl-icon name="book" class=""></sl-icon>
          <span>${msg("User Guide")}</span>
        </span>
        <iframe
          class="size-full text-xs transition-opacity duration-slow"
          src="${this.docsUrl}user-guide/workflow-setup/"
        ></iframe>
        <sl-button
          size="small"
          slot="footer"
          variant="text"
          href="${this.fullDocsUrl}"
          target="_blank"
        >
          <sl-icon slot="suffix" name="box-arrow-up-right"></sl-icon>
          ${msg("Open in new window")}</sl-button
        >
      </sl-drawer>
    `;
  }

  private renderSuperadminBanner() {
    if (this.userInfo?.isSuperAdmin) {
      return html`<btrix-super-admin-banner
        class="contents"
      ></btrix-super-admin-banner>`;
    }
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

    const showFullLogo =
      this.viewState.route === "login" || !this.authService.authState;

    return html`
      <div class="border-b bg-neutral-50">
        <nav
          class="box-border flex min-h-12 flex-wrap items-center gap-x-5 gap-y-3 p-3 leading-none md:py-0 xl:pl-6"
        >
          <div class="order-1 flex flex-1 items-center">
            <a
              class="items-between flex gap-2"
              aria-label="home"
              href=${this.homePath}
              @click=${(e: MouseEvent) => {
                if (isSuperAdmin) {
                  this.clearSelectedOrg();
                }
                this.navigate.link(e);
              }}
            >
              <div
                class="${showFullLogo
                  ? "w-[10.5rem]"
                  : "w-6 lg:w-[10.5rem]"} h-6 bg-cover bg-no-repeat"
                style="background-image: url(${brandLockupColor})"
                role="img"
                title="Browsertrix logo"
              ></div>
            </a>
            ${when(
              this.userInfo,
              () => html`
                ${isSuperAdmin
                  ? html`
                      <div
                        role="separator"
                        class="mx-2.5 h-6 w-0 border-l"
                      ></div>
                      <a
                        class="flex items-center gap-2 font-medium text-primary-700 transition-colors hover:text-primary"
                        href="/${RouteNamespace.Superadmin}"
                        @click=${(e: MouseEvent) => {
                          this.clearSelectedOrg();
                          this.navigate.link(e);
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
                ${this.renderOrgs()}
              `,
            )}
          </div>
          <div
            class="${this.authState
              ? "gap-4"
              : "gap-2"} order-2 flex flex-grow-0 items-center md:order-3"
          >
            ${this.authState
              ? html`${this.userInfo && !isSuperAdmin
                    ? html`
                        <button
                          class="flex items-center gap-2 leading-none text-neutral-500 hover:text-primary"
                          @click=${() => this.showUserGuide()}
                        >
                          <sl-icon
                            name="book"
                            class="mt-px size-4 text-base"
                          ></sl-icon>
                          <span class="sr-only lg:not-sr-only"
                            >${msg("User Guide")}</span
                          >
                        </button>
                      `
                    : nothing}
                  <sl-dropdown
                    class="ml-auto"
                    placement="bottom-end"
                    distance="4"
                  >
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
                        @click=${() => this.routeTo("/account/settings")}
                      >
                        <sl-icon slot="prefix" name="person-gear"></sl-icon>
                        ${msg("Account Settings")}
                      </sl-menu-item>
                      ${this.userInfo?.isSuperAdmin
                        ? html` <sl-menu-item
                            @click=${() =>
                              this.routeTo(urlForName("adminUsersInvite"))}
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
                  ${this.viewState.route !== "login"
                    ? html`
                        <sl-button
                          size="small"
                          variant="primary"
                          href="/log-in"
                          @click=${this.navigate.link}
                        >
                          ${msg("Sign In")}
                        </sl-button>
                      `
                    : nothing}
                  ${(translatedLocales as unknown as string[]).length > 2
                    ? html`
                        <btrix-user-language-select
                          @sl-select=${this.onSelectLocale}
                        ></btrix-user-language-select>
                      `
                    : nothing}
                `}
          </div>
          ${isSuperAdmin
            ? html`
                <div
                  class="order-3 grid w-full auto-cols-max grid-flow-col items-center gap-5 md:order-2 md:w-auto"
                >
                  <a
                    class="font-medium text-neutral-500 hover:text-primary"
                    href=${urlForName("adminCrawls")}
                    @click=${this.navigate.link}
                    >${msg("Running Crawls")}</a
                  >
                </div>
              `
            : nothing}
        </nav>
      </div>
    `;
  }

  private renderOrgs() {
    const orgs = this.userInfo?.orgs;
    if (!orgs) return;

    const selectedOption = this.orgSlugInPath
      ? orgs.find(({ slug }) => slug === this.orgSlugInPath)
      : {
          slug: "",
          name: msg("All Organizations"),
        };

    if (!selectedOption) {
      return;
    }

    // Limit org name display for orgs created before org name max length restriction
    const orgNameLength = 50;

    return html`
      <div role="separator" class="mx-2.5 h-7 w-0 border-l"></div>
      <div class="max-w-32 truncate sm:max-w-52 md:max-w-none">
        ${selectedOption.slug
          ? html`
              <a
                class="font-medium text-neutral-600"
                href=${`${this.navigate.orgBasePath}/${OrgTab.Dashboard}`}
                @click=${this.navigate.link}
              >
                ${selectedOption.name.slice(0, orgNameLength)}
              </a>
            `
          : html`
              <span class="text-neutral-500">
                ${selectedOption.name.slice(0, orgNameLength)}
              </span>
            `}
      </div>
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
                  this.routeTo(
                    `/${RouteNamespace.PrivateOrgs}/${value}/${OrgTab.Dashboard}`,
                  );
                } else {
                  if (this.userInfo) {
                    this.clearSelectedOrg();
                  }
                  this.routeTo(`/`);
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
        class="mx-auto box-border flex w-full max-w-screen-desktop flex-col items-center  gap-4 p-3 md:flex-row"
      >
        <div class="flex-1">
          <a
            class="flex items-center gap-2 leading-none text-neutral-400 hover:text-primary"
            href="https://github.com/webrecorder/browsertrix"
            target="_blank"
            rel="noopener"
          >
            <sl-icon name="github" class="size-4 text-base"></sl-icon>
            ${msg("Source Code")}
          </a>
        </div>
        <div class="flex-1">
          <a
            class="${this.version
              ? "justify-center"
              : "justify-end"} flex items-center gap-2 leading-none text-neutral-400 hover:text-primary"
            href="https://forum.webrecorder.net/c/help/5"
            target="_blank"
            rel="noopener"
          >
            <sl-icon name="patch-question" class="size-4 text-base"></sl-icon>
            ${msg("Help Forum")}
          </a>
        </div>
        ${this.version
          ? html`
              <div
                class="flex flex-1 items-center justify-end gap-2 leading-none"
              >
                <btrix-copy-button
                  class="size-4 text-neutral-400"
                  .getValue=${() => this.version}
                  content=${msg("Copy Browsertrix Version")}
                  size="x-small"
                ></btrix-copy-button>
                <span class="font-monostyle text-xs text-neutral-400">
                  ${this.version}
                </span>
              </div>
            `
          : nothing}
      </footer>
    `;
  }

  // TODO move into separate component
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
          class="flex w-full flex-col items-center justify-center md:bg-neutral-50"
          .viewState=${this.viewState}
          redirectUrl=${this.viewState.params.redirectUrl ||
          this.viewState.data?.redirectUrl}
        ></btrix-log-in>`;

      case "resetPassword":
        return html`<btrix-reset-password
          class="flex w-full items-center justify-center md:bg-neutral-50"
          .viewState=${this.viewState}
        ></btrix-reset-password>`;

      case "admin":
        return this.renderAdminPage(
          () => html`
            <btrix-admin class="w-full bg-neutral-50"></btrix-admin>
          `,
        );

      case "orgs":
        return html`<btrix-orgs class="w-full md:bg-neutral-50"></btrix-orgs>`;

      case "org": {
        if (!this.isUserInCurrentOrg) {
          return this.renderNotFoundPage();
        }

        const slug = this.viewState.params.slug;
        const orgPath = this.viewState.pathname;
        const pathname = this.getLocationPathname();
        const orgTab = pathname
          .slice(pathname.indexOf(slug) + slug.length)
          .replace(/(^\/|\/$)/, "")
          .split("/")[0];

        return html`<btrix-org
          class="w-full"
          .viewStateData=${this.viewState.data}
          .params=${this.viewState.params}
          .maxScale=${this.appState.settings?.maxScale || DEFAULT_MAX_SCALE}
          orgPath=${orgPath.split(slug)[1]}
          orgTab=${orgTab}
        ></btrix-org>`;
      }

      case "publicOrg":
        return html`<btrix-public-org
          class="w-full"
          orgSlug=${this.viewState.params.slug}
        ></btrix-public-org>`;

      case "publicCollection": {
        const { collectionSlug, collectionTab } = this.viewState.params;

        if (!collectionSlug) {
          break;
        }

        return html`<btrix-collection
          class="w-full"
          orgSlug=${this.viewState.params.slug}
          collectionSlug=${collectionSlug}
          tab=${ifDefined(collectionTab || undefined)}
        ></btrix-collection>`;
      }

      case "accountSettings":
        return html`<btrix-account-settings
          class="mx-auto box-border w-full max-w-screen-desktop p-2 md:py-8"
          tab=${this.viewState.params.settingsTab}
        ></btrix-account-settings>`;

      case "adminUsers":
      case "adminUsersInvite":
        return this.renderAdminPage(
          () =>
            html`<btrix-users-invite
              class="mx-auto box-border w-full max-w-screen-desktop p-2 md:py-8"
            ></btrix-users-invite>`,
        );

      case "adminCrawls":
      case "adminCrawl":
        return this.renderAdminPage(
          () =>
            html`<btrix-crawls
              class="w-full"
              @notify=${this.onNotify}
              crawlId=${this.viewState.params.crawlId}
            ></btrix-crawls>`,
        );

      case "awpUploadRedirect": {
        const { orgId, uploadId } = this.viewState.params;
        const slug = this.userInfo?.orgs.find((org) => org.id === orgId)?.slug;
        if (slug) {
          this.routeTo(`/orgs/${slug}/items/upload/${uploadId}`);
          return;
        }
        // falls through
      }

      default:
        return this.renderNotFoundPage();
    }
  }

  private renderAdminPage(renderer: () => TemplateResult) {
    // if (!this.userInfo) return this.renderSpinner();

    if (this.userInfo?.isSuperAdmin) {
      // Dynamically import admin pages
      return until(
        import(/* webpackChunkName: "admin" */ "@/pages/admin/index").then(
          renderer,
        ),
      );
    }

    return this.renderNotFoundPage();
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

  private showUserGuide(pathName?: string) {
    const iframe = this.userGuideDrawer.querySelector("iframe");

    if (iframe) {
      if (pathName) {
        this.fullDocsUrl = this.docsUrl + pathName;
        iframe.src = this.fullDocsUrl;
      } else {
        this.fullDocsUrl = this.docsUrl;
        iframe.src = this.fullDocsUrl;
      }

      if (!this.appState.userGuideOpen) {
        AppStateService.updateUserGuideOpen(true);
      }
    } else {
      console.debug("user guide iframe not found");
    }
  }

  onSelectLocale(e: SlSelectEvent) {
    const locale = e.detail.item.value as TranslatedLocaleEnum;

    if (locale !== this.appState.userPreferences?.language) {
      AppStateService.partialUpdateUserPreferences({ language: locale });
    }
  }

  onLogOut(event: CustomEvent<{ redirect?: boolean } | null>) {
    const detail = event.detail || {};
    const redirect = detail.redirect !== false;

    this.clearUser();

    if (redirect) {
      this.routeTo(urlForName("login"));
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
      this.routeTo(detail.redirectUrl || this.homePath);
    }

    if (detail.firstLogin) {
      this.onFirstLogin({ email: detail.username });
    }

    if (!this.userInfo) {
      if (detail.user) {
        AppStateService.updateUser(formatAPIUser(detail.user));
      } else {
        void this.fetchAndUpdateUserInfo();
      }
    }
  }

  onNeedLogin = (e: CustomEvent<NeedLoginEventDetail>) => {
    e.stopPropagation();

    this.clearUser();
    const redirectUrl = e.detail.redirectUrl;
    this.routeTo(urlForName("login"), {
      redirectUrl,
    });
    if (redirectUrl && redirectUrl !== "/") {
      this.notify.toast({
        message: msg("Please log in to continue."),
        variant: "warning",
        icon: "exclamation-triangle",
        id: "log-in",
      });
    }
  };

  onNavigateTo = (event: CustomEvent<NavigateEventDetail>) => {
    event.stopPropagation();

    const { url, state, resetScroll, replace } = event.detail;

    this.routeTo(url, state, replace);

    if (resetScroll) {
      // Scroll to top of page
      window.scrollTo({ top: 0 });
    }
  };

  onUserInfoChange(event: CustomEvent<Partial<UserInfo>>) {
    AppStateService.updateUser({
      ...this.userInfo,
      ...event.detail,
    } as UserInfo);
  }

  /**
   * Show global toast alert
   */
  onNotify = (event: CustomEvent<NotifyEventDetail>) => {
    event.stopPropagation();

    void toast(event.detail);
  };

  async getUserInfo(): Promise<APIUser> {
    return this.api.fetch("/users/me");
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
              void this.fetchAndUpdateUserInfo();
              this.syncViewState();
            } else {
              this.clearUser();
              this.routeTo(urlForName("login"));
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
