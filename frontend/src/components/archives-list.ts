import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { CurrentUser } from "../types/user";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";

import { isOwner } from "../utils/archives";

@localized()
export class ArchivesList extends LiteElement {
  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Array })
  archiveList: ArchiveData[] = [];

  @property({ type: Boolean })
  skeleton? = false;

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    return html`
      <ul class="border rounded-lg overflow-hidden">
        ${this.archiveList?.map(
          (archive) =>
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
                (this.userInfo.isAdmin ||
                  isOwner(archive.users[this.userInfo.id].role))
                  ? html`<sl-tag size="small" variant="primary"
                      >${msg("Owner")}</sl-tag
                    >`
                  : ""}
              </li>
            `
        )}
      </ul>
    `;
  }

  private renderSkeleton() {
    return html`
      <div class="border rounded-lg overflow-hidden">
        <div class="p-3 md:p-6 bg-white border-t first:border-t-0 text-primary">
          <sl-skeleton class="h-6 w-80"></sl-skeleton>
        </div>
      </div>
    `;
  }

  private makeOnArchiveClick(archive: ArchiveData): Function {
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
