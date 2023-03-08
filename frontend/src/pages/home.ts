import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";
import type { APIPaginatedList } from "../types/api";
import { maxLengthValidator } from "../utils/form";

@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  orgId?: string;

  @state()
  private isInviteComplete?: boolean;

  @state()
  private orgList?: OrgData[];

  @state()
  private isAddingOrg = false;

  @state()
  private isAddOrgFormVisible = false;

  @state()
  private isSubmittingNewOrg = false;

  private validateOrgNameMax = maxLengthValidator(50);

  connectedCallback() {
    if (this.authState) {
      super.connectedCallback();
      if (this.userInfo && !this.orgId) {
        this.fetchOrgs();
      }
    } else {
      this.navTo("/log-in");
    }
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      this.navTo(`/orgs/${this.orgId}/workflows`);
    } else if (changedProperties.has("authState") && this.authState) {
      this.fetchOrgs();
    }
  }

  render() {
    if (!this.userInfo || !this.orgList) {
      return html`
        <div class="flex items-center justify-center my-24 text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    let title: any;
    let content: any;

    if (this.userInfo.isAdmin === true) {
      title = msg("Welcome");
      content = this.renderLoggedInAdmin();
    }

    if (this.userInfo.isAdmin === false) {
      title = msg("Organizations");
      content = this.renderLoggedInNonAdmin();
    }

    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-xl font-medium">${title}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        ${content}
      </main>
    `;
  }

  private renderLoggedInAdmin() {
    if (this.orgList!.length) {
      return this.renderAdminOrgs();
    }

    return html`
      <section class="border rounded-lg bg-white p-4 md:p-8 mb-5">
        <p class="text-lg mb-4 text-neutral-600">
          ${msg("Invite users to start archiving.")}
        </p>

        ${this.renderInvite()}
      </section>
    `;
  }

  private renderAdminOrgs() {
    return html`
      <section class="border rounded-lg bg-white p-4 md:p-6 mb-5">
        <form
          @submit=${(e: SubmitEvent) => {
            const formData = new FormData(e.target as HTMLFormElement);
            const id = formData.get("crawlId");
            this.navTo(`/crawls/crawl/${id}`);
          }}
        >
          <div class="flex flex-wrap items-center">
            <div
              class="w-full md:w-min grow-0 mr-8 text-lg font-medium whitespace-nowrap"
            >
              ${msg("Go to Crawl")}
            </div>
            <div class="grow mt-2 md:mt-0 md:mr-2">
              <sl-input
                name="crawlId"
                placeholder=${msg("Enter Crawl ID")}
                required
              ></sl-input>
            </div>
            <div class="grow-0 mt-2 md:mt-0 text-right">
              <sl-button variant="neutral" type="submit">
                <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
                ${msg("Go")}</sl-button
              >
            </div>
          </div>
        </form>
      </section>

      <div class="grid grid-cols-5 gap-8">
        <div class="col-span-5 md:col-span-3">
          <section>
            <header class="flex items-start justify-between">
              <h2 class="text-lg font-medium mb-3 mt-2">
                ${msg("All Organizations")}
              </h2>
              <sl-button
                variant="primary"
                @click=${() => (this.isAddingOrg = true)}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Organization")}
              </sl-button>
            </header>
            <btrix-orgs-list
              .userInfo=${this.userInfo}
              .orgList=${this.orgList}
              .defaultOrg=${ifDefined(
                this.userInfo?.orgs.find((org) => org.default === true)
              )}
            ></btrix-orgs-list>
          </section>
        </div>
        <div class="col-span-5 md:col-span-2">
          <section class="md:border md:rounded-lg md:bg-white p-3 md:p-8">
            <h2 class="text-lg font-medium mb-3">
              ${msg("Invite User to Org")}
            </h2>
            ${this.renderInvite()}
          </section>
        </div>
      </div>

      <btrix-dialog
        label=${msg("New Organization")}
        ?open=${this.isAddingOrg}
        @sl-request-close=${() => (this.isAddingOrg = false)}
        @sl-show=${() => (this.isAddOrgFormVisible = true)}
        @sl-after-hide=${() => (this.isAddOrgFormVisible = false)}
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
                    @sl-input=${this.validateOrgNameMax.validate}
                  >
                  </sl-input>
                </div>
              </form>
              <div slot="footer" class="flex justify-between">
                <sl-button form="newOrgForm" type="reset" size="small"
                  >${msg("Cancel")}</sl-button
                >
                <sl-button
                  form="newOrgForm"
                  variant="primary"
                  type="submit"
                  size="small"
                  ?loading=${this.isSubmittingNewOrg}
                  ?disabled=${this.isSubmittingNewOrg}
                  >${msg("Create Org")}</sl-button
                >
              </div>
            `
          : ""}
      </btrix-dialog>
    `;
  }

  private renderLoggedInNonAdmin() {
    if (this.orgList && !this.orgList.length) {
      return html`<div class="border rounded-lg bg-white p-4 md:p-8">
        <p class="text-neutral-400 text-center">
          ${msg("You don't have any organizations.")}
        </p>
      </div>`;
    }

    return html`
      <btrix-orgs-list
        .userInfo=${this.userInfo}
        .orgList=${this.orgList}
        ?skeleton=${!this.orgList}
      ></btrix-orgs-list>
    `;
  }

  private renderInvite() {
    if (this.isInviteComplete) {
      return html`
        <sl-button @click=${() => (this.isInviteComplete = false)}
          >${msg("Send another invite")}</sl-button
        >
      `;
    }

    const defaultOrg = this.userInfo?.orgs.find(
      (org) => org.default === true
    ) || { name: "" };
    return html`
      <btrix-invite-form
        .authState=${this.authState}
        .orgs=${this.orgList}
        .defaultOrg=${defaultOrg || null}
        @success=${() => (this.isInviteComplete = true)}
      ></btrix-invite-form>
    `;
  }

  private async fetchOrgs() {
    this.orgList = await this.getOrgs();
  }

  private async getOrgs(): Promise<OrgData[]> {
    const data: APIPaginatedList = await this.apiFetch(
      "/orgs",
      this.authState!
    );

    return data.items;
  }

  private async onSubmitNewOrg(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const params = serialize(formEl);
    this.isSubmittingNewOrg = true;

    try {
      await this.apiFetch(`/orgs/create`, this.authState!, {
        method: "POST",
        body: JSON.stringify(params),
      });

      this.fetchOrgs();
      this.notify({
        message: msg(str`Created new org named "${params.name}".`),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
      this.isAddingOrg = false;
    } catch (e: any) {
      this.notify({
        message: e.isApiError
          ? e.message
          : msg("Sorry, couldn't create organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingNewOrg = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
