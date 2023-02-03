import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { ViewState } from "../../utils/APIRouter";
import type { AuthState } from "../../utils/AuthService";
import type { CurrentUser } from "../../types/user";
import type { OrgData } from "../../utils/orgs";
import { isOwner, isCrawler } from "../../utils/orgs";
import LiteElement, { html } from "../../utils/LiteElement";
import { needLogin } from "../../utils/auth";
import "./crawl-configs-detail";
import "./crawl-configs-list";
import "./crawl-configs-new";
import "./crawl-detail";
import "./crawls-list";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import "./settings";

export type OrgTab =
  | "crawls"
  | "crawl-configs"
  | "browser-profiles"
  | "settings";

type Params = {
  crawlId?: string;
  crawlConfigId?: string;
  browserProfileId?: string;
  browserId?: string;
};

const defaultTab = "crawls";

@needLogin
@localized()
export class Org extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  // Path after `/orgs/:orgId/`
  @property({ type: String })
  orgPath!: string;

  @property({ type: Object })
  params!: Params;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @state()
  private org?: OrgData | null;

  get userOrg() {
    if (!this.userInfo) return null;
    return this.userInfo.orgs.find(({ id }) => id === this.orgId)!;
  }

  get isOwner() {
    const userOrg = this.userOrg;
    if (userOrg) return isOwner(userOrg.role);
    return false;
  }

  get isCrawler() {
    const userOrg = this.userOrg;
    if (userOrg) return isCrawler(userOrg.role);
    return false;
  }

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      try {
        this.org = await this.getOrg(this.orgId);
      } catch {
        this.org = null;

        this.notify({
          message: msg("Sorry, couldn't retrieve organization at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  render() {
    if (this.org === null) {
      // TODO handle 404 and 500s
      return "";
    }

    if (!this.org || !this.userInfo) {
      return html`
        <div
          class="absolute top-1/2 left-1/2 -mt-4 -ml-4"
          style="font-size: 2rem"
        >
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    let tabPanelContent = "" as any;

    switch (this.orgTab) {
      case "crawls":
        tabPanelContent = this.renderCrawls();
        break;
      case "crawl-configs":
        tabPanelContent = this.renderCrawlTemplates();
        break;
      case "browser-profiles":
        tabPanelContent = this.renderBrowserProfiles();
        break;
      case "settings": {
        if (this.isOwner) {
          tabPanelContent = this.renderOrgSettings();
          break;
        }
      }
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    return html`
      ${this.renderOrgNavBar()}
      <main>
        <div
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-5"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${tabPanelContent}
        </div>
      </main>
    `;
  }

  private renderOrgNavBar() {
    return html`
      <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
        <nav class="-ml-3 flex items-end overflow-x-auto">
          ${this.renderNavTab({ tabName: "crawls", label: msg("Crawls") })}
          ${when(this.isCrawler, () =>
            this.renderNavTab({
              tabName: "crawl-configs",
              label: msg("Crawl Configs"),
            })
          )}
          ${when(this.isCrawler, () =>
            this.renderNavTab({
              tabName: "browser-profiles",
              label: msg("Browser Profiles"),
            })
          )}
          ${when(this.isOwner, () =>
            this.renderNavTab({
              tabName: "settings",
              label: msg("Org Settings"),
            })
          )}
        </nav>
      </div>

      <hr />
    `;
  }

  private renderNavTab({ tabName, label }: { tabName: OrgTab; label: string }) {
    const isActive = this.orgTab === tabName;

    return html`
      <a
        id="${tabName}-tab"
        class="block flex-shrink-0 px-3 hover:bg-neutral-50 rounded-t transition-colors"
        href=${`/orgs/${this.orgId}/${tabName}`}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        <div
          class="text-sm font-medium py-3 border-b-2 transition-colors ${isActive
            ? "border-primary text-primary"
            : "border-transparent text-neutral-500 hover:border-neutral-100 hover:text-neutral-900"}"
        >
          ${label}
        </div>
      </a>
    `;
  }

  private renderCrawls() {
    const crawlsBaseUrl = `/orgs/${this.orgId}/crawls`;

    if (this.params.crawlId) {
      return html` <btrix-crawl-detail
        .authState=${this.authState!}
        crawlId=${this.params.crawlId}
        crawlsBaseUrl=${crawlsBaseUrl}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      userId=${this.userInfo!.id}
      crawlsBaseUrl=${crawlsBaseUrl}
      ?shouldFetch=${this.orgTab === "crawls"}
    ></btrix-crawls-list>`;
  }

  private renderCrawlTemplates() {
    const isEditing = this.params.hasOwnProperty("edit");
    const isNewResourceTab = this.params.hasOwnProperty("new");

    if (this.params.crawlConfigId) {
      return html`
        <btrix-crawl-configs-detail
          class="col-span-5 mt-6"
          .authState=${this.authState!}
          .orgId=${this.orgId!}
          .crawlConfigId=${this.params.crawlConfigId}
          .isEditing=${isEditing}
        ></btrix-crawl-configs-detail>
      `;
    }

    if (isNewResourceTab) {
      const crawlTemplate = this.viewStateData?.crawlTemplate;

      return html` <btrix-crawl-configs-new
        class="col-span-5 mt-6"
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .initialCrawlTemplate=${crawlTemplate}
      ></btrix-crawl-configs-new>`;
    }

    return html`<btrix-crawl-configs-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      userId=${this.userInfo!.id}
    ></btrix-crawl-configs-list>`;
  }

  private renderBrowserProfiles() {
    const isNewResourceTab = this.params.hasOwnProperty("new");

    if (this.params.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        profileId=${this.params.browserProfileId}
      ></btrix-browser-profiles-detail>`;
    }

    if (this.params.browserId) {
      return html`<btrix-browser-profiles-new
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .browserId=${this.params.browserId}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      ?showCreateDialog=${isNewResourceTab}
    ></btrix-browser-profiles-list>`;
  }

  private renderOrgSettings() {
    // const activePanel = this.
    const activePanel = this.orgPath.includes("/members")
      ? "members"
      : "information";
    const isAddingMember = this.params.hasOwnProperty("invite");

    return html`<btrix-org-settings
      .authState=${this.authState}
      .userInfo=${this.userInfo}
      .org=${this.org}
      .orgId=${this.orgId}
      activePanel=${activePanel}
      ?isAddingMember=${isAddingMember}
    ></btrix-org-settings>`;
  }

  private async getOrg(orgId: string): Promise<OrgData> {
    const data = await this.apiFetch(`/orgs/${orgId}`, this.authState!);

    return data;
  }
}
