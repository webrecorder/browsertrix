import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { ViewState } from "../../utils/APIRouter";
import type { AuthState } from "../../utils/AuthService";
import type { CurrentUser } from "../../types/user";
import type { ArchiveData } from "../../utils/archives";
import LiteElement, { html } from "../../utils/LiteElement";
import { needLogin } from "../../utils/auth";
import { isOwner, AccessCode } from "../../utils/archives";
import "./crawl-templates-detail";
import "./crawl-templates-list";
import "./crawl-templates-new";
import "./crawl-detail";
import "./crawls-list";

export type ArchiveTab =
  | "crawls"
  | "crawl-templates"
  | "browser-profiles"
  | "members";

const defaultTab = "crawls";

@needLogin
@localized()
export class Archive extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  archiveTab: ArchiveTab = defaultTab;

  @property({ type: String })
  browserProfileId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: String })
  crawlConfigId?: string;

  @property({ type: Boolean })
  isAddingMember: boolean = false;

  @property({ type: Boolean })
  isEditing: boolean = false;

  /** Whether new resource is being added in tab */
  @property({ type: Boolean })
  isNewResourceTab: boolean = false;

  @state()
  private archive?: ArchiveData | null;

  @state()
  private successfullyInvitedEmail?: string;

  async firstUpdated() {
    if (!this.archiveId) return;

    try {
      const archive = await this.getArchive(this.archiveId);

      if (!archive) {
        this.navTo("/archives");
      } else {
        this.archive = archive;
      }
    } catch {
      this.archive = null;

      this.notify({
        message: msg("Sorry, couldn't retrieve archive at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async updated(changedProperties: any) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.successfullyInvitedEmail = undefined;
    }
  }

  render() {
    if (this.archive === null) {
      // TODO handle 404 and 500s
      return "";
    }

    if (!this.archive) {
      return html`
        <div
          class="absolute top-1/2 left-1/2 -mt-4 -ml-4"
          style="font-size: 2rem"
        >
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    const showMembersTab = Boolean(this.archive.users);

    let tabPanelContent = "" as any;

    switch (this.archiveTab) {
      case "crawls":
        tabPanelContent = this.renderCrawls();
        break;
      case "crawl-templates":
        tabPanelContent = this.renderCrawlTemplates();
        break;
      case "browser-profiles":
        tabPanelContent = this.renderBrowserProfiles();
        break;
      case "members":
        if (this.isAddingMember) {
          tabPanelContent = this.renderAddMember();
        } else {
          tabPanelContent = this.renderMembers();
        }
        break;
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    return html`<article>
      <header class="w-full max-w-screen-lg mx-auto px-3 box-border py-4">
        <nav class="text-sm text-neutral-400">
          <a
            class="font-medium hover:underline"
            href="/archives"
            @click="${this.navLink}"
            >${msg("Archives")}</a
          >
          <span class="font-mono">/</span>
          <span>${this.archive.name}</span>
        </nav>
      </header>

      <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
        <nav class="-ml-3 flex items-end overflow-x-auto">
          ${this.renderNavTab({ tabName: "crawls", label: msg("Crawls") })}
          ${this.renderNavTab({
            tabName: "crawl-templates",
            label: msg("Crawl Templates"),
          })}
          ${this.renderNavTab({
            tabName: "browser-profiles",
            label: msg("Browser Profiles"),
          })}
          ${showMembersTab
            ? this.renderNavTab({ tabName: "members", label: msg("Members") })
            : ""}
        </nav>
      </div>

      <hr />

      <main>
        <div
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-5"
          aria-labelledby="${this.archiveTab}-tab"
        >
          ${tabPanelContent}
        </div>
      </main>
    </article>`;
  }

  private renderNavTab({
    tabName,
    label,
  }: {
    tabName: ArchiveTab;
    label: string;
  }) {
    const isActive = this.archiveTab === tabName;

    return html`
      <a
        id="${tabName}-tab"
        class="block flex-shrink-0 px-3 hover:bg-neutral-50 rounded-t transition-colors"
        href=${`/archives/${this.archiveId}/${tabName}`}
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
    const crawlsBaseUrl = `/archives/${this.archiveId}/crawls`;

    if (this.crawlId) {
      return html` <btrix-crawl-detail
        .authState=${this.authState!}
        crawlId=${this.crawlId}
        crawlsBaseUrl=${crawlsBaseUrl}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      archiveId=${this.archiveId!}
      crawlsBaseUrl=${crawlsBaseUrl}
      ?shouldFetch=${this.archiveTab === "crawls"}
    ></btrix-crawls-list>`;
  }

  private renderCrawlTemplates() {
    if (this.crawlConfigId) {
      return html`
        <btrix-crawl-templates-detail
          class="col-span-5 mt-6"
          .authState=${this.authState!}
          .archiveId=${this.archiveId!}
          .crawlConfigId=${this.crawlConfigId}
          .isEditing=${this.isEditing}
        ></btrix-crawl-templates-detail>
      `;
    }

    if (this.isNewResourceTab) {
      const crawlTemplate = this.viewStateData?.crawlTemplate;

      return html` <btrix-crawl-templates-new
        class="col-span-5 mt-6"
        .authState=${this.authState!}
        .archiveId=${this.archiveId!}
        .initialCrawlTemplate=${crawlTemplate}
      ></btrix-crawl-templates-new>`;
    }

    return html`<btrix-crawl-templates-list
      .authState=${this.authState!}
      .archiveId=${this.archiveId!}
    ></btrix-crawl-templates-list>`;
  }

  private renderBrowserProfiles() {
    const mock = [
      {
        id: "1",
        name: "Twitter Example",
        description:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        last_updated: new Date().toUTCString(),
        domains: ["https://twitter.com"],
      },
      {
        id: "2",
        name: "Twitter Webrecorder",
        description: "Et netus et malesuada fames.",
        last_updated: new Date().toUTCString(),
        domains: ["https://twitter.com", "https://twitter.com/webrecorder_io"],
      },
    ];

    if (this.browserProfileId) {
      const profile = mock.find(({ id }) => id === this.browserProfileId)!;

      return html`
        <div class="mb-7">
          <a
            class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
            href=${`/archives/${this.archiveId}/browser-profiles`}
            @click=${this.navLink}
          >
            <sl-icon
              name="arrow-left"
              class="inline-block align-middle"
            ></sl-icon>
            <span class="inline-block align-middle"
              >${msg("Back to Browser Profiles")}</span
            >
          </a>
        </div>

        <header>
          <h2 class="text-2xl font-medium mb-3 md:h-8">${profile.name}</h2>
        </header>
      `;
    }

    return html`
      <div role="table">
        <div class="mb-2 px-4" role="rowgroup">
          <div
            class="hidden md:grid grid-cols-8 gap-3 md:gap-5 text-sm text-neutral-500"
            role="row"
          >
            <div class="col-span-4" role="columnheader" aria-sort="none">
              ${msg("Description")}
            </div>
            <div class="col-span-1" role="columnheader" aria-sort="none">
              ${msg("Last Updated")}
            </div>
            <div class="col-span-3" role="columnheader" aria-sort="none">
              ${msg("Domains Visited")}
            </div>
          </div>
        </div>
        <div class="border rounded" role="rowgroup">
          ${mock.map(
            (data) => html`
              <a
                class="block p-4 leading-none hover:bg-zinc-50 hover:text-primary border-t first:border-t-0 transition-colors"
                href=${`/archives/${this.archiveId}/browser-profiles/profile/${data.id}`}
                @click=${this.navLink}
                title=${data.name}
              >
                <div class="grid grid-cols-8 gap-3 md:gap-5" role="row">
                  <div class="col-span-8 md:col-span-4" role="cell">
                    <div class="font-medium mb-1">${data.name}</div>
                    <div class="text-sm truncate" title=${data.description}>
                      ${data.description}
                    </div>
                  </div>
                  <div class="col-span-8 md:col-span-1 text-sm" role="cell">
                    ${new Date(data.last_updated).toLocaleDateString()}
                  </div>
                  <div class="col-span-8 md:col-span-3 text-sm" role="cell">
                    ${data.domains.join(", ")}
                  </div>
                </div>
              </a>
            `
          )}
        </div>
      </div>
    `;
  }

  private renderMembers() {
    if (!this.archive!.users) return;

    let successMessage;

    if (this.successfullyInvitedEmail) {
      successMessage = html`
        <div class="my-3">
          <btrix-alert type="success"
            >${msg(
              str`Successfully invited ${this.successfullyInvitedEmail}`
            )}</btrix-alert
          >
        </div>
      `;
    }
    return html`${successMessage}

      <div class="text-right">
        <sl-button
          href=${`/archives/${this.archiveId}/members/add-member`}
          type="primary"
          @click=${this.navLink}
          >${msg("Add Member")}</sl-button
        >
      </div>

      <div role="table">
        <div class="border-b" role="rowgroup">
          <div class="flex font-medium" role="row">
            <div class="w-1/2 px-3 py-2" role="columnheader" aria-sort="none">
              ${msg("Name", { desc: "Team member's name" })}
            </div>
            <div class="px-3 py-2" role="columnheader" aria-sort="none">
              ${msg("Role", { desc: "Team member's role" })}
            </div>
          </div>
        </div>
        <div role="rowgroup">
          ${Object.entries(this.archive!.users).map(
            ([id, { name, role }]) => html`
              <div class="border-b flex" role="row">
                <div class="w-1/2 p-3" role="cell">
                  ${name ||
                  html`<span class="text-gray-400">${msg("Member")}</span>`}
                </div>
                <div class="p-3" role="cell">
                  ${isOwner(role)
                    ? msg("Admin")
                    : role === AccessCode.crawler
                    ? msg("Crawler")
                    : msg("Viewer")}
                </div>
              </div>
            `
          )}
        </div>
      </div>`;
  }

  private renderAddMember() {
    return html`
      <div class="mb-5">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${`/archives/${this.archiveId}/members`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Members")}</span
          >
        </a>
      </div>

      <div class="border rounded-lg p-4 md:p-8 md:pt-6">
        <h2 class="text-lg font-medium mb-4">${msg("Add New Member")}</h2>
        <btrix-archive-invite-form
          @success=${this.onInviteSuccess}
          @cancel=${() => this.navTo(`/archives/${this.archiveId}/members`)}
          .authState=${this.authState}
          .archiveId=${this.archiveId}
        ></btrix-archive-invite-form>
      </div>
    `;
  }

  async getArchive(archiveId: string): Promise<ArchiveData> {
    const data = await this.apiFetch(`/archives/${archiveId}`, this.authState!);

    return data;
  }

  onInviteSuccess(
    event: CustomEvent<{ inviteEmail: string; isExistingUser: boolean }>
  ) {
    this.successfullyInvitedEmail = event.detail.inviteEmail;

    this.navTo(`/archives/${this.archiveId}/members`);
  }

  updateUrl(event: CustomEvent<{ name: ArchiveTab }>) {
    this.navTo(`/archives/${this.archiveId}/${event.detail.name}`);
  }
}
