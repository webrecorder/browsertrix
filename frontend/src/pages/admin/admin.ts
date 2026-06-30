import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import needLogin from "@/decorators/needLogin";
import type { InviteSuccessDetail } from "@/features/accounts/invite-form";
import { RouteNamespace } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import { type OrgData } from "@/utils/orgs";

/**
 * Browsertrix superadmin dashboard
 */
@customElement("btrix-admin")
@localized()
@needLogin
export class Admin extends BtrixElement {
  @property({ type: Boolean })
  openNewOrgDialog = false;

  @state()
  private orgList?: OrgData[];

  @state()
  private isAddingOrg = false;

  protected firstUpdated(): void {
    this.initSuperAdmin();
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("openNewOrgDialog")) {
      this.isAddingOrg = this.openNewOrgDialog;
    }
  }

  private initSuperAdmin() {
    if (this.userInfo?.isSuperAdmin) {
      if (this.userInfo.orgs.length) {
        void this.fetchOrgs();
      } else {
        this.navigate.to(`/${RouteNamespace.Superadmin}?newOrg=true`);
      }
    }
  }

  render() {
    if (!this.userInfo?.isSuperAdmin) {
      return;
    }

    if (this.userInfo.orgs.length && !this.orgList) {
      return html`
        <btrix-document-title
          title=${msg("Dashboard – Admin")}
        ></btrix-document-title>

        <div class="my-24 flex items-center justify-center text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return html`
      <btrix-document-title
        title=${msg("Dashboard – Admin")}
      ></btrix-document-title>

      <div class="bg-white">
        <header
          class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4 md:py-8"
        >
          <h1 class="text-xl font-medium">${msg("Welcome")}</h1>
        </header>
        <hr />
      </div>
      <main class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4">
        ${this.renderAdminOrgs()}
      </main>
      ${this.renderNewOrgDialog()}
    `;
  }

  private renderNewOrgDialog() {
    return html`<btrix-new-org-dialog
      .open=${this.isAddingOrg}
      @sl-after-hide=${() => {
        if (this.openNewOrgDialog) {
          this.navigate.to(`/${RouteNamespace.Superadmin}`);
        } else {
          this.isAddingOrg = false;
        }
      }}
      @btrix-success=${() => {
        void this.fetchOrgs();
      }}
    ></btrix-new-org-dialog>`;
  }

  private renderAdminOrgs() {
    return html`
      <div class="grid gap-6 lg:grid-cols-[1fr,minmax(320px,20%)]">
        <div class="flex flex-wrap gap-4 *:flex-1 lg:order-1 lg:block">
          <btrix-instance-stats
            .orgList=${this.orgList ?? []}
          ></btrix-instance-stats>
          <section class="p-3 md:rounded-lg md:border md:bg-white md:p-8">
            <h2 class="mb-3 text-lg font-medium">
              ${msg("Invite User to Org")}
            </h2>
            ${this.renderInvite()}
          </section>
        </div>
        <section class="grid min-w-0 grid-rows-[auto_1fr]">
          <header class="mb-3 flex items-center justify-between border-b pb-3">
            <h2 class="text-lg font-medium">${msg("All Organizations")}</h2>
            <sl-button
              variant="primary"
              size="small"
              href="/${RouteNamespace.Superadmin}?newOrg=1"
              @click=${this.navigate.link.bind(this)}
            >
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${msg("New Organization")}
            </sl-button>
          </header>
          <btrix-orgs-list
            .orgList=${this.orgList}
            @update-quotas=${this.onUpdateOrgQuotas}
            @update-proxies=${this.onUpdateOrgProxies}
            @btrix-update-feature-flags=${this.onUpdateOrgFeatureFlags}
            class="grid grid-rows-[auto_auto_1fr]"
          ></btrix-orgs-list>
        </section>
      </div>
    `;
  }

  private renderInvite() {
    return html`
      <btrix-invite-form
        .orgs=${this.orgList}
        @btrix-invite-success=${(e: CustomEvent<InviteSuccessDetail>) => {
          const org = this.orgList?.find(({ id }) => id === e.detail.orgId);

          this.notify.toast({
            message: html`
              ${msg("Invite sent!")}
              <br />
              <a
                class="underline hover:no-underline"
                href="/orgs/${org?.slug || e.detail.orgId}/settings/members"
                @click=${this.navigate.link.bind(this)}
              >
                ${msg("View org members")}
              </a>
            `,
            variant: "success",
            icon: "check2-circle",
            id: "user-updated-status",
          });
        }}
      ></btrix-invite-form>
    `;
  }

  private async fetchOrgs() {
    try {
      const data =
        await this.api.fetch<APIPaginatedList<OrgData>>("/orgs?sortBy=name");
      this.orgList = data.items;
    } catch (e) {
      console.debug(e);
    }
  }

  async onUpdateOrgQuotas(e: CustomEvent) {
    const org = e.detail as OrgData;

    await this.api.fetch(`/orgs/${org.id}/quotas`, {
      method: "POST",
      body: JSON.stringify(org.quotas),
    });
  }

  async onUpdateOrgProxies(e: CustomEvent) {
    const org = e.detail as OrgData;

    await this.api.fetch(`/orgs/${org.id}/proxies`, {
      method: "POST",
      body: JSON.stringify({
        allowSharedProxies: org.allowSharedProxies,
        allowedProxies: org.allowedProxies,
      }),
    });
  }

  async onUpdateOrgFeatureFlags() {
    void this.fetchOrgs();
  }
}
