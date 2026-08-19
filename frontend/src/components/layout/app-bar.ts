import { localized, msg } from "@lit/localize";
import { type SlMenu, type SlSelectEvent } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import { OrgTab, RouteNamespace } from "@/routes";
import {
  translatedLocales,
  type TranslatedLocaleEnum,
} from "@/types/localization";
import { ORG_NAME_MAX_LENGTH } from "@/types/org";
import { type UserOrg } from "@/types/user";
import { type RouteName, type ViewState } from "@/utils/APIRouter";
import { urlForName } from "@/utils/router";
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";
import brandLockupColor from "~assets/brand/browsertrix-lockup-color.svg";

// TODO Validate against mkdocs paths
const mapToUserGuide: Partial<Record<RouteName, string>> = {
  home: "",
  org: "#quick-links",
  join: "signup#set-up-your-personal-account",
};

@customElement("btrix-app-bar")
@localized()
export class AppBar extends BtrixElement {
  @property({ type: Object })
  viewState?: ViewState;

  @property({ type: String })
  docsUrl = "";

  @property({ type: String })
  homePath = "";

  @property({ type: String })
  orgSlugInPath = "";

  render() {
    const isSuperAdmin = this.authState && this.userInfo?.isSuperAdmin;
    const showFullLogo = this.viewState?.route === "login" || !this.authState;

    return html`
      <div class="border-b bg-neutral-50">
        <nav
          class="box-border flex min-h-12 flex-wrap items-center gap-2 px-3 leading-none xl:px-6"
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

              ${isSuperAdmin
                ? html`<btrix-badge size="large" variant="orange" outline>
                    ${msg("Admin")}
                  </btrix-badge>`
                : nothing}
            </a>
            ${when(
              this.userInfo,
              () => html`
                ${this.renderOrgs()}
                ${isSuperAdmin && this.org?.note
                  ? html`
                      <btrix-popover>
                        <span slot="content" class="whitespace-pre-line"
                          >${this.org.note}</span
                        >
                        <sl-icon
                          name="chat-left-text"
                          class="relative flex-shrink-0 text-neutral-500"
                          title=${msg("This org has a note")}
                        ></sl-icon>
                      </btrix-popover>
                    `
                  : nothing}
              `,
            )}
          </div>
          <div class="order-2 flex flex-grow-0 items-center gap-2 md:order-3">
            ${this.authState
              ? html`<btrix-org-active-crawls-status></btrix-org-active-crawls-status>
                  ${this.userInfo && !isSuperAdmin
                    ? this.renderOrgUserActions()
                    : nothing}
                  <btrix-popover-menu>
                    ${this.renderNavButton({
                      slot: "trigger",
                      content: msg("Account"),
                      iconName: "person-circle",
                      href: urlForName("accountSettings"),
                      mobileIconOnly: true,
                    })}
                    <sl-menu class="w-60 min-w-min max-w-full">
                      ${this.renderMenuUserInfo()}
                      <btrix-menu-item-link
                        href=${urlForName("accountSettings")}
                      >
                        <sl-icon slot="prefix" name="person-gear"></sl-icon>
                        ${msg("Account Settings")}
                      </btrix-menu-item-link>
                      ${this.userInfo?.isSuperAdmin
                        ? html` <btrix-menu-item-link
                            href=${urlForName("adminUsersInvite")}
                          >
                            <sl-icon slot="prefix" name="person-plus"></sl-icon>
                            ${msg("Invite Users")}
                          </btrix-menu-item-link>`
                        : ""}
                      <sl-divider></sl-divider>
                      <sl-menu-item
                        @click=${() =>
                          this.dispatchEvent(
                            new CustomEvent("btrix-log-out", {
                              bubbles: true,
                              composed: true,
                            }),
                          )}
                      >
                        <sl-icon slot="prefix" name="door-open"></sl-icon>
                        ${msg("Log Out")}
                      </sl-menu-item>
                    </sl-menu>
                  </btrix-popover-menu>`
              : html`
                  ${this.viewState?.route === "join"
                    ? this.renderUserGuideButton()
                    : this.viewState?.route !== "login"
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
                  class="order-3 flex w-full auto-cols-max items-center gap-2 md:order-2 md:w-auto"
                >
                  ${this.renderSuperadminNav()}
                  <div
                    role="separator"
                    class="hidden h-7 w-0 border-l md:block"
                  ></div>
                </div>
              `
            : nothing}
        </nav>
      </div>
    `;
  }

  private renderNavButton({
    content,
    iconName,
    href,
    slot,
    className,
    mobileIconOnly,
    click,
  }: {
    content: string | TemplateResult;
    iconName?: string;
    href?: string;
    slot?: string;
    className?: string;
    mobileIconOnly?: boolean;
    click?: (e: MouseEvent) => void;
  }) {
    const currentPage = this.viewState?.pathname === href;

    return html`<sl-button
      variant="text"
      size="small"
      class=${clsx(
        tw`part-[label]:font-medium part-[label]:text-neutral-600 part-[label]:hover:text-primary-600`,
        (href ?? click) && tw`hover:part-[base]:bg-primary-50`,
        currentPage &&
          tw`part-[base]:bg-primary-50 part-[base]:ring-1 part-[base]:ring-primary-100`,
        iconName
          ? [mobileIconOnly && tw`part-[label]:px-1 md:part-[label]:px-3`]
          : tw`part-[label]:[padding-inline-start:0]`,

        className,
      )}
      slot=${ifDefined(slot)}
      href=${ifDefined(href)}
      @click=${(e: MouseEvent) => {
        click?.(e);

        if (href) this.navigate.link(e);
      }}
      aria-current=${ifDefined(currentPage ? "page" : undefined)}
    >
      ${iconName
        ? html`<sl-icon slot="prefix" name=${iconName}></sl-icon>`
        : nothing}
      ${mobileIconOnly
        ? html`<span class="sr-only md:not-sr-only">${content}</span>`
        : content}
    </sl-button>`;
  }

  private renderSuperadminNav() {
    return html`${this.renderNavButton({
      content: msg("Organizations"),
      iconName: "building-fill-gear",
      href: urlForName("admin"),
      click: () => {
        this.clearSelectedOrg();
      },
    })}
    ${this.renderNavButton({
      content: html`${msg("Active Crawls")}
        <btrix-active-crawls-badge
          slot="suffix"
          class="-mt-0.5"
        ></btrix-active-crawls-badge>`,
      iconName: "gear-wide-connected",
      href: urlForName("adminCrawls"),
    })}`;
  }

  private renderOrgUserActions() {
    return html`<btrix-popover-menu>
      ${this.renderUserGuideButton()}
      <sl-menu @sl-select=${this.showUserGuide}>
        <sl-menu-item>
          ${msg("Open to Side")}
          <sl-icon slot="suffix" name="layout-sidebar-inset-reverse"></sl-icon>
        </sl-menu-item>
        <btrix-menu-item-link href="${this.docsUrl}user-guide" target="_blank">
          ${msg("Open in New Tab")}
          <sl-icon slot="suffix" name="arrow-up-right"></sl-icon>
        </btrix-menu-item-link>
      </sl-menu>
    </btrix-popover-menu>`;
  }

  private renderUserGuideButton() {
    return this.renderNavButton({
      slot: "trigger",
      content: msg("User Guide"),
      iconName: "book",
      mobileIconOnly: true,
      click: this.showUserGuide,
    });
  }

  private readonly showUserGuide = () => {
    this.dispatchEvent(
      new CustomEvent<BtrixUserGuideShowEvent["detail"]>(
        "btrix-user-guide-show",
        {
          detail: {
            path:
              (this.viewState?.route && mapToUserGuide[this.viewState.route]) ??
              "",
          },
          bubbles: true,
          composed: true,
        },
      ),
    );
  };

  private renderOrgs() {
    const orgs = this.userInfo?.orgs;
    if (!orgs) return;

    const fallbackOption = {
      slug: "",
      name: msg("None"),
    };
    const selectedOption = this.orgSlugInPath
      ? orgs.find(({ slug }) => slug === this.orgSlugInPath)
      : fallbackOption;

    if (!selectedOption) {
      return;
    }

    // Limit org name display for orgs created before org name max length restriction
    const orgNameLength = ORG_NAME_MAX_LENGTH;

    const selectedOptionIsOrg = (
      opt: UserOrg | typeof fallbackOption,
    ): opt is UserOrg => Boolean(opt.slug.length);
    const onSelect = (e: Event) => {
      void (e.currentTarget as SlMenu).closest("sl-dropdown")?.hide();
    };
    const dashboardLink = (org: UserOrg) =>
      html`<a
        class="font-medium text-neutral-600 transition-colors duration-fast hover:text-primary-600"
        href="/${RouteNamespace.PrivateOrgs}/${org.slug}/${OrgTab.Dashboard}"
        @click=${this.navigate.link}
      >
        ${org.name.slice(0, orgNameLength)}
      </a>`;
    const noSelection = () => {
      if (this.viewState?.pathname === urlForName("accountSettings")) {
        // Show default org from state if it exists
        const defaultOrgSlug =
          this.orgSlugState || this.userInfo?.orgs[0]?.slug;
        const org = defaultOrgSlug
          ? orgs.find(({ slug }) => slug === defaultOrgSlug)
          : null;

        if (org) {
          return dashboardLink(org);
        }
      }

      console.debug("no default org user:", this.userInfo);

      return this.renderNavButton({
        content: msg("Dashboard"),
        iconName: "grid-fill",
        href: "/",
      });
    };

    const showSelectOrg =
      this.userInfo.isSuperAdmin && !selectedOptionIsOrg(selectedOption);

    return html`
      <div role="separator" class="mx-2.5 h-7 w-0 border-l"></div>
      ${showSelectOrg
        ? nothing
        : html`<div class="max-w-32 truncate sm:max-w-52 md:max-w-none">
            ${selectedOptionIsOrg(selectedOption)
              ? dashboardLink(selectedOption)
              : noSelection()}
          </div>`}
      ${when(
        this.userInfo.isSuperAdmin || orgs.length > 1,
        () => html`
          <sl-dropdown
            placement=${showSelectOrg ? "bottom-start" : "bottom-end"}
          >
            ${showSelectOrg
              ? this.renderNavButton({
                  slot: "trigger",
                  content: html`
                    ${msg("Select an Org")}
                    <sl-icon slot="suffix" name="chevron-expand"></sl-icon>
                  `,
                })
              : html`<sl-icon-button
                  slot="trigger"
                  name="chevron-expand"
                  label=${msg("Expand org list")}
                ></sl-icon-button>`}

            <sl-menu>
              ${when(
                this.userInfo?.isSuperAdmin,
                () => html`
                  <btrix-menu-item-link
                    ?checked=${!selectedOption.slug}
                    href=${urlForName("admin")}
                    @click=${(e: Event) => {
                      onSelect(e);

                      if (this.userInfo) {
                        this.clearSelectedOrg();
                      }
                    }}
                    >${fallbackOption.name}</btrix-menu-item-link
                  >
                  <sl-divider></sl-divider>
                `,
              )}
              ${orgs.map(
                (org) => html`
                  <btrix-menu-item-link
                    ?checked=${org.slug === selectedOption.slug}
                    href=${`/${RouteNamespace.PrivateOrgs}/${org.slug}/${OrgTab.Dashboard}`}
                    @click=${onSelect}
                    >${org.name.slice(0, orgNameLength)}</btrix-menu-item-link
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

    return html`
      <sl-menu-label>
        <div class="font-normal">${msg("Logged in as")}</div>
        <div class="whitespace-nowrap text-neutral-700">
          ${this.userInfo.email}
        </div>
      </sl-menu-label>
      <sl-divider></sl-divider>
    `;
  }

  private onSelectLocale(e: SlSelectEvent) {
    const locale = e.detail.item.value as TranslatedLocaleEnum;

    if (locale !== this.appState.userPreferences?.language) {
      AppStateService.partialUpdateUserPreferences({ language: locale });
    }
  }

  private clearSelectedOrg() {
    AppStateService.updateOrgSlug(null);
  }
}
