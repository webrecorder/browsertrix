import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { CurrentUser } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";

import { isOwner } from "../utils/orgs";

@localized()
export class OrgsList extends LiteElement {
  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Array })
  orgList: OrgData[] = [];

  @property({ type: Boolean })
  skeleton? = false;

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    return html`
      <ul class="border rounded-lg overflow-hidden">
        ${this.orgList?.map(
          (org) =>
            html`
              <li
                class="p-3 md:p-6 bg-white border-t first:border-t-0 text-primary hover:text-indigo-400"
                role="button"
                @click=${this.makeOnOrgClick(org)}
              >
                <span class="font-medium mr-2 transition-colors"
                  >${org.name}</span
                >
                ${this.userInfo &&
                org.users &&
                (this.userInfo.isAdmin ||
                  isOwner(org.users[this.userInfo.id].role))
                  ? html`<sl-tag size="small" variant="primary"
                      >${msg("Admin")}</sl-tag
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

  private makeOnOrgClick(org: OrgData): Function {
    const navigate = () => this.navTo(`/orgs/${org.id}/crawls`);

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
