import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState, CurrentUser } from "../types/auth";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { isOwner } from "../utils/archives";

type Tab = "settings" | "members";

const defaultTab = "settings";

@needLogin
@localized()
export class Archive extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  archiveTab?: Tab = defaultTab;

  @state()
  archive?: ArchiveData;

  async firstUpdated() {
    if (!this.archiveId) return;

    const archive = await this.getArchive(this.archiveId);

    if (!archive) {
      this.navTo("/archives");
    } else {
      this.archive = archive;

      // TODO get archive members
    }
  }

  render() {
    if (!this.archive) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`<article class="grid gap-4">
      <header>
        <h1 class="text-2xl font-bold">${this.archive.name}</h1>
      </header>

      <main>
        <sl-tab-group @sl-tab-show=${this.updateUrl}>
          <sl-tab
            slot="nav"
            panel="settings"
            .active=${this.archiveTab === "settings"}
            >Settings</sl-tab
          >
          <sl-tab
            slot="nav"
            panel="members"
            .active=${this.archiveTab === "members"}
            >Members</sl-tab
          >

          <sl-tab-panel
            name="settings"
            .active=${this.archiveTab === "settings"}
            >TODO</sl-tab-panel
          >
          <sl-tab-panel name="members" .active=${this.archiveTab === "members"}>
            <div class="text-right">
              <sl-button type="primary">Add Member</sl-button>
            </div>

            <div role="table">
              <div class="border-b" role="rowgroup">
                <div class="flex font-medium" role="row">
                  <div
                    class="w-1/2 px-3 py-2"
                    role="columnheader"
                    aria-sort="none"
                  >
                    Name
                  </div>
                  <div class="px-3 py-2" role="columnheader" aria-sort="none">
                    Roles
                  </div>
                </div>
              </div>
              <div role="rowgroup">
                ${Object.entries(this.archive.users).map(
                  ([id, accessCode]) => html`
                    <div class="border-b flex" role="row">
                      <div class="w-1/2 p-3" role="cell">(TODO) ${id}</div>
                      <div class="p-3" role="cell">
                        ${isOwner(accessCode) ? msg("Owner") : msg("Member")}
                      </div>
                    </div>
                  `
                )}
              </div>
            </div>
          </sl-tab-panel>
        </sl-tab-group>
      </main>
    </article>`;
  }

  async getArchive(archiveId: string): Promise<ArchiveData> {
    const data = await this.apiFetch(`/archives/${archiveId}`, this.authState!);

    return data;
  }

  updateUrl(event: CustomEvent<{ name: Tab }>) {
    window.history.pushState(
      null,
      "",
      `/archives/${this.archiveId}/${event.detail.name}`
    );
  }
}
