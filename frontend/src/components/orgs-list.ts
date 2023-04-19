import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { CurrentUser, UserOrg } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";

import { isAdmin } from "../utils/orgs";
import { DASHBOARD_ROUTE } from "../routes";

@localized()
export class OrgsList extends LiteElement {
  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Array })
  orgList: OrgData[] = [];

  @property({ type: Object })
  defaultOrg?: UserOrg;

  @property({ type: Boolean })
  skeleton? = false;

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    return html`
      <ul class="border rounded-lg overflow-hidden">
        ${this.orgList?.map(this.renderOrg)}
      </ul>
    `;
  }

  private renderOrg = (org: OrgData) => {
    let defaultLabel: any;
    if (this.defaultOrg && org.id === this.defaultOrg.id) {
      defaultLabel = html`<sl-tag size="small" variant="primary" class="mr-2"
        >${msg("Default")}</sl-tag
      >`;
    }
    const memberCount = Object.keys(org.users || {}).length;

    return html`
      <li
        class="p-3 bg-white border-t first:border-t-0 text-primary hover:text-indigo-400 flex items-center justify-between"
        role="button"
        @click=${this.makeOnOrgClick(org)}
      >
        <div class="font-medium mr-2 transition-colors">
          ${defaultLabel}${org.name}
        </div>
        <div class="text-xs text-neutral-400">
          ${memberCount === 1
            ? msg(`1 member`)
            : msg(str`${memberCount} members`)}
        </div>
      </li>
    `;
  };

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
    const navigate = () => this.navTo(`/orgs/${org.id}/${DASHBOARD_ROUTE}`);

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
