import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { isOwner } from "../utils/archives";

@needLogin
@localized()
export class Archives extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  archiveList?: ArchiveData[];

  async firstUpdated() {
    this.archiveList = await this.getArchives();
  }

  render() {
    if (!this.archiveList) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`<div class="grid gap-4">
      <h1 class="text-xl font-bold">${msg("Archives")}</h1>

      <ul class="border rounded-lg grid gap-6 overflow-hidden">
        ${this.archiveList.map(
          (archive) =>
            html`
              <li
                class="p-3 md:p-6 hover:bg-gray-50"
                role="button"
                @click=${this.makeOnArchiveClick(archive)}
              >
                <span class="text-primary font-medium mr-2"
                  >${archive.name}</span
                >
                ${this.userInfo &&
                archive.users &&
                isOwner(archive.users[this.userInfo.id].role)
                  ? html`<sl-tag size="small" type="primary"
                      >${msg("Owner")}</sl-tag
                    >`
                  : ""}
              </li>
            `
        )}
      </ul>
    </div>`;
  }

  async getArchives(): Promise<ArchiveData[]> {
    const data = await this.apiFetch("/archives", this.authState!);

    return data.archives;
  }

  makeOnArchiveClick(archive: ArchiveData): Function {
    const navigate = () => this.navTo(`/archives/${archive.id}/settings`);

    if (typeof window.getSelection !== undefined) {
      return () => {
        // Prevent navigation on user text selection
        if (window.getSelection()?.type === "Range") {
          return;
        }

        navigate();
      };
    }

    return navigate;
  }
}
