import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState, CurrentUser } from "../types/auth";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { isOwner } from "../utils/archives";

@needLogin
@localized()
export class Archive extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  archiveId?: string;

  @state()
  archive?: ArchiveData;

  async firstUpdated() {
    if (!this.archiveId) return;

    const archive = await this.getArchive(this.archiveId);

    if (!archive) {
      this.navTo("/archives");
    } else {
      this.archive = archive;

      console.log(archive);
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

    return html`<div class="grid gap-4">
      <header>
        <h1 class="text-2xl font-bold">${this.archive.name}</h1>
        <div class="my-2">
          ${isOwner(this.archive, this.userInfo)
            ? html`<sl-tag size="small" type="primary">Owner</sl-tag>`
            : html`<sl-tag size="small">Member</sl-tag>`}
        </div>
      </header>
    </div>`;
  }

  async getArchive(archiveId: string): Promise<ArchiveData> {
    const data = await this.apiFetch(`/archives/${archiveId}`, this.authState!);

    return data;
  }
}
