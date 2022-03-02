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
    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-4 md:py-8"
        >
          <h1 class="text-2xl font-medium">${msg("Archives")}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 box-border py-4">
        ${this.archiveList
          ? html`
              <ul class="border rounded-lg overflow-hidden">
                ${this.archiveList.map(
                  (archive, i) =>
                    html`
                      <li
                        class="p-3 md:p-6 bg-white border-t first:border-t-0 text-primary hover:text-indigo-400"
                        role="button"
                        @click=${this.makeOnArchiveClick(archive)}
                      >
                        <span class="font-medium mr-2 transition-colors"
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
            `
          : html`
              <div class="flex items-center justify-center my-24 text-4xl">
                <sl-spinner></sl-spinner>
              </div>
            `}
      </main>
    `;
  }

  async getArchives(): Promise<ArchiveData[]> {
    const data = await this.apiFetch("/archives", this.authState!);

    return data.archives;
  }

  makeOnArchiveClick(archive: ArchiveData): Function {
    const navigate = () => this.navTo(`/archives/${archive.id}/crawls`);

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
