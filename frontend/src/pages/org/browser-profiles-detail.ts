import { localized, msg, str } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";
import queryString from "query-string";

import type { Profile } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { ClipboardController } from "@/controllers/clipboard";
import type { BrowserConnectionChange } from "@/features/browser-profiles/profile-browser";
import { pageNav } from "@/layouts/pageHeader";
import { isApiError } from "@/utils/api";
import { maxLengthValidator } from "@/utils/form";
import { isArchivingDisabled } from "@/utils/orgs";
import { richText } from "@/utils/rich-text";

const DESCRIPTION_MAXLENGTH = 500;

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-detail
 *  profileId=${profileId}
 * ></btrix-browser-profiles-detail>
 * ```
 */
@customElement("btrix-browser-profiles-detail")
@localized()
export class BrowserProfilesDetail extends BtrixElement {
  @property({ type: String })
  profileId!: string;

  @property({ type: Boolean })
  isCrawler = false;

  @state()
  private profile?: Profile;

  @state()
  private isBrowserLoading = false;

  @state()
  private isBrowserLoaded = false;

  @state()
  private isSubmittingBrowserChange = false;

  @state()
  private isSubmittingProfileChange = false;

  @state()
  private browserId?: string;

  @state()
  private isEditDialogOpen = false;

  @state()
  private isEditDialogContentVisible = false;

  @query("#profileBrowserContainer")
  private readonly profileBrowserContainer?: HTMLElement | null;

  @query("#discardChangesDialog")
  private readonly discardChangesDialog?: Dialog | null;

  private readonly validateNameMax = maxLengthValidator(50);
  private readonly validateDescriptionMax = maxLengthValidator(500);

  disconnectedCallback() {
    if (this.browserId) {
      void this.deleteBrowser(this.browserId);
    }
    super.disconnectedCallback();
  }

  firstUpdated() {
    void this.fetchProfile();
  }

  render() {
    const isBackedUp =
      this.profile?.resource?.replicas &&
      this.profile.resource.replicas.length > 0;
    const none = html`<span class="text-neutral-400">${msg("None")}</span>`;

    return html`<div class="mb-7">${this.renderBreadcrumbs()}</div>

      <header class="mb-3 items-center justify-between md:flex">
        <h1 class="min-w-0 flex-1 truncate text-xl font-medium leading-7">
          ${this.profile?.name
            ? html`${this.profile.name}`
            : html`<sl-skeleton class="w-80 md:h-7"></sl-skeleton>`}
        </h1>
        <div>
          ${this.profile
            ? this.renderMenu()
            : html`<sl-skeleton
                style="width: 6em; height: 2em;"
              ></sl-skeleton>`}
        </div>
      </header>

      <section class="mb-5 rounded-lg border px-4 py-2">
        <btrix-desc-list horizontal>
          <btrix-desc-list-item label=${msg("Crawler Release Channel")}>
            ${this.profile
              ? this.profile.crawlerChannel
                ? capitalize(this.profile.crawlerChannel)
                : none
              : nothing}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Created On")}>
            ${this.profile
              ? html`
                  <btrix-format-date
                    date=${this.profile.created}
                    month="2-digit"
                    day="2-digit"
                    year="numeric"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></btrix-format-date>
                `
              : nothing}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Last Updated")}>
            ${this.profile
              ? html` <btrix-format-date
                  date=${
                    // NOTE older profiles may not have "modified" data
                    this.profile.modified || this.profile.created
                  }
                  month="2-digit"
                  day="2-digit"
                  year="numeric"
                  hour="numeric"
                  minute="numeric"
                  time-zone-name="short"
                ></btrix-format-date>`
              : nothing}
          </btrix-desc-list-item>
          ${
            // NOTE older profiles may not have "modified/created by" data
            this.profile?.modifiedByName || this.profile?.createdByName
              ? html`
                  <btrix-desc-list-item label=${msg("Updated By")}>
                    ${this.profile.modifiedByName || this.profile.createdByName}
                  </btrix-desc-list-item>
                `
              : nothing
          }
        </btrix-desc-list>
      </section>

      <div class="mb-7 flex flex-col gap-5 lg:flex-row">
        <section class="flex-1">
          <header class="flex items-center gap-2">
            <sl-tooltip
              content=${isBackedUp ? msg("Backed Up") : msg("Not Backed Up")}
              ?disabled=${!this.profile}
            >
              <sl-icon
                class="${isBackedUp
                  ? "text-success"
                  : "text-neutral-500"} text-base"
                name=${this.profile
                  ? isBackedUp
                    ? "clouds-fill"
                    : "cloud-slash-fill"
                  : "clouds"}
              ></sl-icon>
            </sl-tooltip>
            <h2 class="text-lg font-medium leading-none">
              ${msg("Browser Profile")}
            </h2>
          </header>

          ${when(this.isCrawler, () =>
            this.browserId || this.isBrowserLoading
              ? html`
                  <div id="profileBrowserContainer" class="flex h-screen py-3">
                    <div class="flex flex-1 flex-col gap-2">
                      <btrix-profile-browser
                        class="flex-1 overflow-hidden rounded border"
                        browserId=${ifDefined(this.browserId)}
                        .origins=${this.profile?.origins}
                        @btrix-browser-load=${() =>
                          (this.isBrowserLoaded = true)}
                        @btrix-browser-error=${this.onBrowserError}
                        @btrix-browser-reload=${this.startBrowserPreview}
                        @btrix-browser-connection-change=${this
                          .onBrowserConnectionChange}
                      ></btrix-profile-browser>
                      <div
                        class="flex-0 sticky bottom-2 rounded-lg border bg-neutral-0 shadow"
                      >
                        ${this.renderBrowserProfileControls()}
                      </div>
                    </div>
                  </div>
                `
              : html`<div
                  class="mt-3 flex aspect-video flex-col items-center justify-center rounded-lg border bg-neutral-50"
                >
                  <p
                    class="mx-auto mb-4 max-w-prose text-center text-neutral-600"
                  >
                    ${msg(
                      "View or edit the current browser profile configuration.",
                    )}
                  </p>
                  <sl-button
                    ?disabled=${isArchivingDisabled(this.org)}
                    @click=${this.startBrowserPreview}
                  >
                    <sl-icon slot="prefix" name="gear"></sl-icon>
                    ${msg("Configure Browser Profile")}
                  </sl-button>
                </div>`,
          )}
        </section>
        ${when(
          !(this.browserId || this.isBrowserLoading),
          this.renderVisitedSites,
        )}
      </div>

      <section class="mb-7">
        <header class="flex items-center justify-between">
          <h2 class="mb-1 text-lg font-medium leading-none">
            ${msg("Description")}
          </h2>
          ${when(
            this.isCrawler,
            () => html`
              <sl-icon-button
                class="text-base"
                name="pencil"
                @click=${() => (this.isEditDialogOpen = true)}
                label=${msg("Edit description")}
              ></sl-icon-button>
            `,
          )}
        </header>
        <!-- display: inline -->
        <div
          class="leading whitespace-pre-line rounded border p-5 leading-relaxed first-line:leading-[0]"
          >${this.profile
            ? this.profile.description
              ? richText(this.profile.description)
              : html`
                  <div class="text-center text-neutral-400">
                    &nbsp;${msg("No description added.")}
                  </div>
                `
            : nothing}</div
        >
      </section>

      <btrix-dialog id="discardChangesDialog" .label=${msg("Cancel Editing?")}>
        ${msg(
          "Are you sure you want to discard changes to this browser profile?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            .autofocus=${true}
            @click=${() => void this.discardChangesDialog?.hide()}
          >
            ${msg("No, Continue Editing")}
          </sl-button>
          <sl-button
            size="small"
            variant="danger"
            @click=${() => {
              void this.cancelEditBrowser();
              void this.discardChangesDialog?.hide();
            }}
            >${msg("Yes, Discard Changes")}
          </sl-button>
        </div>
      </btrix-dialog>

      <btrix-dialog
        .label=${msg(str`Edit Metadata`)}
        .open=${this.isEditDialogOpen}
        @sl-request-close=${() => (this.isEditDialogOpen = false)}
        @sl-show=${() => (this.isEditDialogContentVisible = true)}
        @sl-after-hide=${() => (this.isEditDialogContentVisible = false)}
      >
        ${this.isEditDialogContentVisible ? this.renderEditProfile() : nothing}
      </btrix-dialog> `;
  }

  private renderBreadcrumbs() {
    const breadcrumbs = [
      {
        href: `${this.navigate.orgBasePath}/browser-profiles`,
        content: msg("Browser Profiles"),
      },
      {
        content: this.profile?.name,
      },
    ];

    return pageNav(breadcrumbs);
  }

  private readonly renderVisitedSites = () => {
    return html`
      <section class="flex-grow-1 flex flex-col lg:w-[60ch]">
        <header class="flex-0 mb-3">
          <h2 class="text-lg font-medium leading-none">
            ${msg("Visited Sites")}
          </h2>
        </header>
        <div class="flex-1 overflow-auto rounded-lg border p-4">
          <ul class="font-monostyle text-neutral-800">
            ${this.profile?.origins.map((origin) => html`<li>${origin}</li>`)}
          </ul>
        </div>
      </section>
    `;
  };

  private renderBrowserProfileControls() {
    return html`
      <div class="flex justify-between p-4">
        <sl-button size="small" @click=${this.onCancel}>
          ${msg("Cancel")}
        </sl-button>
        <div>
          <sl-button
            variant="primary"
            size="small"
            ?loading=${this.isSubmittingBrowserChange}
            ?disabled=${this.isSubmittingBrowserChange || !this.isBrowserLoaded}
            @click=${this.saveBrowser}
          >
            ${msg("Save Browser Profile")}
          </sl-button>
        </div>
      </div>
    `;
  }

  private renderMenu() {
    const archivingDisabled = isArchivingDisabled(this.org);

    return html`
      <sl-dropdown distance="4" placement="bottom-end">
        <sl-button size="small" slot="trigger" caret>
          ${msg("Actions")}
        </sl-button>
        <sl-menu>
          <sl-menu-item @click=${() => (this.isEditDialogOpen = true)}>
            <sl-icon slot="prefix" name="pencil"></sl-icon>
            ${msg("Edit Metadata")}
          </sl-menu-item>
          <sl-menu-item
            ?disabled=${archivingDisabled}
            @click=${this.startBrowserPreview}
          >
            <sl-icon slot="prefix" name="gear"></sl-icon>
            ${msg("Configure Browser Profile")}
          </sl-menu-item>
          <sl-menu-item
            ?disabled=${archivingDisabled}
            @click=${() => void this.duplicateProfile()}
          >
            <sl-icon slot="prefix" name="files"></sl-icon>
            ${msg("Duplicate Profile")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() => ClipboardController.copyToClipboard(this.profileId)}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy Profile ID")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => void this.deleteProfile()}
          >
            <sl-icon slot="prefix" name="trash3"></sl-icon>
            ${msg("Delete Profile")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderEditProfile() {
    if (!this.profile) return;

    return html`
      <form @submit=${this.onSubmitEdit}>
        <div>
          <sl-input
            name="name"
            class="with-max-help-text"
            label=${msg("Name")}
            autocomplete="off"
            value=${this.profile.name}
            help-text=${this.validateNameMax.helpText}
            @sl-input=${this.validateNameMax.validate}
            required
          ></sl-input>
        </div>

        <div class="mb-5">
          <sl-textarea
            name="description"
            class="with-max-help-text"
            label=${msg("Description")}
            value=${this.profile.description || ""}
            rows="3"
            autocomplete="off"
            resize="auto"
            help-text=${this.validateDescriptionMax.helpText}
            @sl-input=${this.validateDescriptionMax.validate}
          ></sl-textarea>
        </div>

        <div class="flex justify-between">
          <sl-button
            variant="default"
            size="small"
            @click=${() => (this.isEditDialogOpen = false)}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            type="submit"
            ?disabled=${this.isSubmittingProfileChange}
            ?loading=${this.isSubmittingProfileChange}
            >${msg("Save Changes")}</sl-button
          >
        </div>
      </form>
    `;
  }

  private async onBrowserError() {
    this.isBrowserLoaded = false;
  }

  private async onBrowserConnectionChange(
    e: CustomEvent<BrowserConnectionChange>,
  ) {
    this.isBrowserLoaded = e.detail.connected;
  }

  private async onCancel() {
    if (this.isBrowserLoaded) {
      void this.discardChangesDialog?.show();
    } else {
      void this.cancelEditBrowser();
    }
  }

  private async startBrowserPreview() {
    if (!this.profile) return;

    this.isBrowserLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.browserId = data.browserid;
      this.isBrowserLoading = false;

      await this.updateComplete;

      this.profileBrowserContainer?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      this.isBrowserLoading = false;

      this.notify.toast({
        message: msg("Sorry, couldn't preview browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-error",
      });
    }
  }

  private async cancelEditBrowser() {
    const prevBrowserId = this.browserId;

    this.isBrowserLoaded = false;
    this.browserId = undefined;

    if (prevBrowserId) {
      try {
        await this.deleteBrowser(prevBrowserId);
      } catch (e) {
        // TODO Investigate DELETE is returning 404
        console.debug(e);
      }
    }
  }

  private async duplicateProfile() {
    if (!this.profile) return;

    this.isBrowserLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify.toast({
        message: msg("Starting up browser with current profile..."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navigate.to(
        `${this.navigate.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?${queryString.stringify({
          url,
          name: this.profile.name,
          description: this.profile.description.slice(0, DESCRIPTION_MAXLENGTH),
          profileId: this.profile.id,
          crawlerChannel: this.profile.crawlerChannel,
          proxyId: this.profile.proxyId,
        })}`,
      );
    } catch (e) {
      this.isBrowserLoading = false;

      this.notify.toast({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-error",
      });
    }
  }

  private async deleteProfile() {
    const profileName = this.profile!.name;

    try {
      await this.api.fetch<Profile>(
        `/orgs/${this.orgId}/profiles/${this.profile!.id}`,
        {
          method: "DELETE",
        },
      );

      this.navigate.to(`${this.navigate.orgBasePath}/browser-profiles`);

      this.notify.toast({
        message: msg(html`Deleted <strong>${profileName}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      let message = msg(
        html`Sorry, couldn't delete browser profile at this time.`,
      );

      if (isApiError(e)) {
        if (e.details === "profile_in_use") {
          message = msg(
            html`Could not delete <strong>${profileName}</strong>, currently in
              use. Please remove browser profile from all crawl workflows to
              continue.`,
          );
        }
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-error",
      });
    }
  }

  private async createBrowser({ url }: { url: string }) {
    const params = {
      url,
      profileId: this.profile!.id,
    };

    return this.api.fetch<{ browserid: string }>(
      `/orgs/${this.orgId}/profiles/browser`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  private async deleteBrowser(id: string) {
    return this.api.fetch(`/orgs/${this.orgId}/profiles/browser/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Fetch browser profile and update internal state
   */
  private async fetchProfile(): Promise<void> {
    try {
      const data = await this.getProfile();

      this.profile = data;
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-error",
      });
    }
  }

  private async getProfile() {
    const data = await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${this.profileId}`,
    );

    return data;
  }

  private async saveBrowser() {
    if (!this.browserId) return;

    this.isSubmittingBrowserChange = true;

    const params = {
      name: this.profile!.name,
      browserid: this.browserId,
    };

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profileId}`,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        },
      );

      if (data.updated) {
        this.notify.toast({
          message: msg("Successfully saved browser profile."),
          variant: "success",
          icon: "check2-circle",
          id: "browser-profile-save-status",
        });

        this.browserId = undefined;
      } else {
        throw data;
      }
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't save browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-save-status",
      });
    }

    this.isSubmittingBrowserChange = false;
  }

  private async onSubmitEdit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const formData = new FormData(formEl);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    const params = {
      name,
      description,
    };

    this.isSubmittingProfileChange = true;

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profileId}`,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        },
      );

      if (data.updated) {
        this.notify.toast({
          message: msg("Successfully saved browser profile."),
          variant: "success",
          icon: "check2-circle",
          id: "browser-profile-save-status",
        });

        this.profile = {
          ...this.profile,
          ...params,
        } as Profile;
        this.isEditDialogOpen = false;
      } else {
        throw data;
      }
    } catch (e) {
      let message = msg("Sorry, couldn't save browser profile at this time.");

      if (isApiError(e) && e.statusCode === 403) {
        if (e.details === "storage_quota_reached") {
          message = msg(
            "Your org does not have enough storage to save this browser profile.",
          );
        } else {
          message = msg("You do not have permission to edit browser profiles.");
        }
      }

      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-save-status",
      });
    }

    this.isSubmittingProfileChange = false;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }
}
