import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { ViewState } from "../../utils/APIRouter";
import type { AuthState } from "../../utils/AuthService";
import type { CurrentUser } from "../../types/user";
import type { ArchiveData } from "../../utils/archives";
import LiteElement, { html } from "../../utils/LiteElement";
import { needLogin } from "../../utils/auth";
import { isOwner } from "../../utils/archives";
import "./crawl-templates-detail";
import "./crawl-templates-list";
import "./crawl-templates-new";
import "./crawl-detail";
import "./crawls-list";

export type ArchiveTab = "crawls" | "crawl-templates" | "members";

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
    if (this.crawlId) {
      return html`<btrix-crawl-detail
        .authState=${this.authState!}
        .archiveId=${this.archiveId!}
        crawlId=${this.crawlId}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      .archiveId=${this.archiveId!}
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
              ${msg("Roles", { desc: "Team member's roles" })}
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
                  ${isOwner(role) ? msg("Admin") : msg("Viewer")}
                </div>
              </div>
            `
          )}
        </div>
      </div>`;
  }

  private renderAddMember() {
    return html`
      <sl-button
        type="text"
        href=${`/archives/${this.archiveId}/members`}
        @click=${this.navLink}
        ><sl-icon name="arrow-left"></sl-icon> ${msg(
          "Back to members list"
        )}</sl-button
      >

      <div class="mt-3 border rounded-lg p-4 md:p-8 md:pt-6">
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
