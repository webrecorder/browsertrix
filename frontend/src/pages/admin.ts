import { localized, msg, str } from "@lit/localize";
import type { SlInput, SlInputEvent } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { InviteSuccessDetail } from "@/features/accounts/invite-form";
import type { APIUser } from "@/index";
import { OrgTab, RouteNamespace } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import { isApiError } from "@/utils/api";
import { maxLengthValidator } from "@/utils/form";
import { type OrgData } from "@/utils/orgs";
import slugifyStrict from "@/utils/slugify";
import { AppStateService } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

/**
 * Home page when org is not selected.
 *
 * Uses custom redirect instead of needLogin decorator to suppress "need login"
 * message when accessing root URL.
 *
 * Only accessed by superadmins. Regular users will be redirected their org.
 * See https://github.com/webrecorder/browsertrix/issues/1972
 */
@customElement("btrix-home")
@localized()
export class Admin extends BtrixElement {
  @state()
  private orgList?: OrgData[];

  @state()
  private orgSlugs: string[] = [];

  @state()
  private isAddingOrg = false;

  @state()
  private isAddOrgFormVisible = false;

  @state()
  private isSubmittingNewOrg = false;

  @state()
  private isOrgNameValid: boolean | null = null;

  private get slug() {
    return this.appState.orgSlug;
  }

  private readonly validateOrgNameMax = maxLengthValidator(40);

  connectedCallback() {
    if (this.authState) {
      if (this.slug) {
        this.navigate.to(`/orgs/${this.slug}`);
      } else {
        super.connectedCallback();
      }
    } else {
      this.navigate.to("/log-in");
    }
  }

  willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has("appState.userInfo") && this.userInfo) {
      if (this.userInfo.isSuperAdmin) {
        this.initSuperAdmin();
      } else if (this.userInfo.orgs.length) {
        this.navigate.to(
          `/${RouteNamespace.PrivateOrgs}/${this.userInfo.orgs[0].slug}/${OrgTab.Dashboard}`,
        );
      } else {
        this.navigate.to(`/account/settings`);
      }
    }
  }

  protected firstUpdated(): void {
    this.initSuperAdmin();
  }

  private initSuperAdmin() {
    if (this.userInfo?.isSuperAdmin && !this.orgList) {
      if (this.userInfo.orgs.length) {
        void this.fetchOrgs();
      } else {
        this.isAddingOrg = true;
        this.isAddOrgFormVisible = true;
      }
    }
  }

  render() {
    if (!this.userInfo || !this.userInfo.isSuperAdmin) {
      return;
    }

    if (this.userInfo.orgs.length && !this.orgList) {
      return html`
        <btrix-document-title
          title=${msg("Admin dashboard")}
        ></btrix-document-title>

        <div class="my-24 flex items-center justify-center text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return html`
      <btrix-document-title
        title=${msg("Admin dashboard")}
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
      ${this.renderAddOrgDialog()}
    `;
  }

  private renderAdminOrgs() {
    return html`
      <section class="mb-5 rounded-lg border bg-white p-4 md:p-6">
        <form
          @submit=${(e: SubmitEvent) => {
            const formData = new FormData(e.target as HTMLFormElement);
            const id = formData.get("crawlId");
            this.navigate.to(`/crawls/crawl/${id?.toString()}`);
          }}
        >
          <div class="flex flex-wrap items-center">
            <div
              class="mr-8 w-full grow-0 whitespace-nowrap text-lg font-medium md:w-min"
            >
              ${msg("Go to Crawl")}
            </div>
            <div class="mt-2 grow md:mr-2 md:mt-0">
              <sl-input
                name="crawlId"
                placeholder=${msg("Enter Archived Item ID")}
                required
              ></sl-input>
            </div>
            <div class="mt-2 grow-0 text-right md:mt-0">
              <sl-button variant="neutral" type="submit">
                <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                ${msg("Go")}</sl-button
              >
            </div>
          </div>
        </form>
      </section>

      <div class="grid grid-cols-3 gap-6">
        <div class="col-span-3 md:col-span-2">
          <section>
            <header
              class="mb-3 flex items-center justify-between border-b pb-3"
            >
              <h2 class="text-lg font-medium">${msg("All Organizations")}</h2>
              <sl-button
                variant="primary"
                size="small"
                @click=${() => (this.isAddingOrg = true)}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Organization")}
              </sl-button>
            </header>
            <btrix-orgs-list
              .orgList=${this.orgList}
              @update-quotas=${this.onUpdateOrgQuotas}
              @update-proxies=${this.onUpdateOrgProxies}
            ></btrix-orgs-list>
          </section>
        </div>
        <div class="col-span-3 md:col-span-1">
          <section class="p-3 md:rounded-lg md:border md:bg-white md:p-8">
            <h2 class="mb-3 text-lg font-medium">
              ${msg("Invite User to Org")}
            </h2>
            ${this.renderInvite()}
          </section>
        </div>
      </div>
    `;
  }

  private renderAddOrgDialog() {
    let orgNameStatusLabel = msg("Start typing to see availability");
    let orgNameStatusIcon = html`
      <sl-icon class="mr-3 text-neutral-300" name="check-lg"></sl-icon>
    `;

    if (this.isOrgNameValid) {
      orgNameStatusLabel = msg("This org name is available");
      orgNameStatusIcon = html`
        <sl-icon class="mr-3 text-success" name="check-lg"></sl-icon>
      `;
    } else if (this.isOrgNameValid === false) {
      orgNameStatusLabel = msg("This org name is taken");
      orgNameStatusIcon = html`
        <sl-icon class="mr-3 text-danger" name="x-lg"></sl-icon>
      `;
    }

    return html`
      <btrix-dialog
        .label=${msg("New Organization")}
        .open=${this.isAddingOrg}
        @sl-request-close=${(e: CustomEvent) => {
          // Disable closing if there are no orgs
          if (this.orgList?.length) {
            this.isAddingOrg = false;
          } else {
            e.preventDefault();
          }
        }}
        @sl-show=${() => (this.isAddOrgFormVisible = true)}
        @sl-after-hide=${() => {
          this.isAddOrgFormVisible = false;
          this.isOrgNameValid = null;
        }}
      >
        ${this.isAddOrgFormVisible
          ? html`
              <form
                id="newOrgForm"
                @reset=${() => (this.isAddingOrg = false)}
                @submit=${this.onSubmitNewOrg}
              >
                <div class="mb-5">
                  <sl-input
                    class="with-max-help-text"
                    name="name"
                    label=${msg("Org Name")}
                    placeholder=${msg("My Organization")}
                    autocomplete="off"
                    required
                    help-text=${this.validateOrgNameMax.helpText}
                    @sl-input=${this.onOrgNameInput}
                  >
                    <sl-tooltip
                      slot="suffix"
                      content=${orgNameStatusLabel}
                      @sl-hide=${(e: CustomEvent) => e.stopPropagation()}
                      @sl-after-hide=${(e: CustomEvent) => e.stopPropagation()}
                      hoist
                    >
                      ${orgNameStatusIcon}
                    </sl-tooltip>
                  </sl-input>
                </div>
              </form>
              <div slot="footer" class="flex justify-between">
                ${this.orgList?.length
                  ? html`<sl-button form="newOrgForm" type="reset" size="small">
                      ${msg("Cancel")}
                    </sl-button>`
                  : ""}

                <sl-button
                  form="newOrgForm"
                  variant="primary"
                  type="submit"
                  size="small"
                  ?loading=${this.isSubmittingNewOrg}
                  ?disabled=${this.isSubmittingNewOrg}
                >
                  ${msg("Create Org")}
                </sl-button>
              </div>
            `
          : ""}
      </btrix-dialog>
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
      this.orgList = await this.getOrgs();
      this.orgSlugs = await this.getOrgSlugs();
    } catch (e) {
      console.debug(e);
    }
  }

  private async getOrgs() {
    const data =
      await this.api.fetch<APIPaginatedList<OrgData>>("/orgs?sortBy=name");

    return data.items;
  }

  private async getOrgSlugs() {
    const data = await this.api.fetch<{ slugs: string[] }>("/orgs/slugs");

    return data.slugs;
  }

  private async onOrgNameInput(e: SlInputEvent) {
    this.validateOrgNameMax.validate(e);

    const input = e.target as SlInput;
    const slug = slugifyStrict(input.value);
    const isInvalid = this.orgSlugs.includes(slug);

    if (isInvalid) {
      input.setCustomValidity(msg("This org name is already taken."));
    } else {
      input.setCustomValidity("");
    }

    this.isOrgNameValid = !isInvalid;
  }

  private async onSubmitNewOrg(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const params = serialize(formEl);
    this.isSubmittingNewOrg = true;

    try {
      // TODO return entire object from API
      await this.api.fetch<{ added: true; id: string }>(`/orgs/create`, {
        method: "POST",
        body: JSON.stringify(params),
      });
      await this.fetchOrgs();
      const userInfo = await this.getUserInfo();
      AppStateService.updateUser(formatAPIUser(userInfo));

      this.notify.toast({
        message: msg(str`Created new org named "${params.name}".`),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
      this.isAddingOrg = false;
    } catch (e) {
      let message = msg("Sorry, couldn't create organization at this time.");

      if (isApiError(e)) {
        if (e.details === "duplicate_org_name") {
          message = msg("This org name is already taken, try another one.");
        } else if (e.details === "duplicate_org_slug") {
          message = msg(
            "This org URL identifier is already taken, try another one.",
          );
        } else if (e.details === "invalid_slug") {
          message = msg(
            "This org URL identifier is invalid. Please use alphanumeric characters and dashes (-) only.",
          );
        }
      }

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "org-invalid",
      });
    }

    this.isSubmittingNewOrg = false;
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

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  async getUserInfo(): Promise<APIUser> {
    return this.api.fetch("/users/me");
  }
}
