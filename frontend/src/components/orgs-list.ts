import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { CurrentUser, UserOrg } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";

import { isAdmin } from "../utils/orgs";
import { DASHBOARD_ROUTE } from "../routes";
import { SlInput } from "@shoelace-style/shoelace";

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

  @property({ type: Object })
  currOrg?: OrgData | null = null;

  render() {
    if (this.skeleton) {
      return this.renderSkeleton();
    }

    return html`
      <ul class="border rounded-lg overflow-hidden">
        ${this.orgList?.map(this.renderOrg)}
        ${this.renderOrgQuotas()}
      </ul>
    `;
  }

  private renderOrgQuotas() {
    if (!this.currOrg) {
      return html``;
    }

    return html`
    <sl-dialog
      label=${msg(str`Quotas for: ${this.currOrg.name}`)}
      ?open=${!!this.currOrg}
    @sl-request-close=${() => (this.currOrg = null)}
  >
  ${Object.entries(this.currOrg.quotas).map(([key, value]) => {
    return html`
    <sl-input
    name=${key}
    value=${value}
    type="number"
    @sl-input="${this.onUpdateQuota}"
    ><span slot="prefix">${key}</span></sl-input>`;
  })}
  <sl-button @click="${this.onSubmitQuotas}" class="mt-2" variant="primary">Update Quotas</sl-button>

  </sl-dialog>
    `;
  }

  private onUpdateQuota(e: CustomEvent) {
    const inputEl = e.target as SlInput;
    const quotas = this.currOrg?.quotas;
    if (quotas) {
      quotas[inputEl.name] = Number(inputEl.value);
    }
  }

  private onSubmitQuotas() {
    if (this.currOrg) {
      this.dispatchEvent(new CustomEvent("update-quotas", {detail: this.currOrg}));
    }
    this.currOrg = null;
  }

  private showQuotas(org: OrgData) {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.currOrg = org;
      return false;
    };

    return stop;
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
        <div class="flex flex-row items-center">
          <sl-button size="small" class="mr-3" @click="${this.showQuotas(org)}">
          <sl-icon name="gear" slot="prefix"></sl-icon>
          </sl-button>
          <div class="text-xs text-neutral-400">
            ${memberCount === 1
              ? msg(`1 member`)
              : msg(str`${memberCount} members`)}
          </div>
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
    const navigate = () => this.navTo(`/orgs/${org.id}/workflows/crawls`);

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
