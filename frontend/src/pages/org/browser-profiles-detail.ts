import { localized, msg, str } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Profile } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { BrowserConnectionChange } from "@/features/browser-profiles/profile-browser";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { getLocale } from "@/utils/localization";

const DESCRIPTION_MAXLENGTH = 500;

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-detail
 *  authState=${authState}
 *  orgId=${orgId}
 *  profileId=${profileId}
 * ></btrix-browser-profiles-detail>
 * ```
 */
@localized()
@customElement("btrix-browser-profiles-detail")
export class BrowserProfilesDetail extends TailwindElement {
  @property({ type: Object, attribute: false })
  authState!: AuthState;

  @property({ type: String, attribute: false })
  orgId!: string;

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

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

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
    const none = html`<span class="text-neutral-400">${msg("None")}</span>`;

    return html`<div class="mb-7">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${`${this.navigate.orgBasePath}/browser-profiles`}
          @click=${this.navigate.link}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Browser Profiles")}</span
          >
        </a>
      </div>

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

      <section class="mb-5 rounded border p-4">
        <dl class="grid grid-cols-3 gap-5">
          <div class="col-span-3 md:col-span-1">
            <dt class="text-sm text-0-600">${msg("Description")}</dt>
            <dd>
              ${this.profile
                ? this.profile.description
                  ? this.profile.description.slice(0, DESCRIPTION_MAXLENGTH)
                  : none
                : ""}
            </dd>
          </div>
          <div class="col-span-3 md:col-span-1">
            <dt class="text-sm text-0-600">
              <span class="inline-block align-middle"
                >${msg("Created at")}</span
              >
            </dt>
            <dd>
              ${this.profile
                ? html`
                    <sl-format-date
                      lang=${getLocale()}
                      date=${`${this.profile.created}Z` /** Z for UTC */}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="numeric"
                      minute="numeric"
                      time-zone-name="short"
                    ></sl-format-date>
                  `
                : ""}
            </dd>
          </div>
          <div class="col-span-3 md:col-span-1">
            <dt class="text-sm text-0-600">
              <span class="inline-block align-middle"
                >${msg("Crawl Workflows")}</span
              >
              <sl-tooltip content=${msg("Crawl workflows using this profile")}>
                <sl-icon
                  class="inline-block align-middle"
                  name="info-circle"
                ></sl-icon>
              </sl-tooltip>
            </dt>
            <dd>
              <ul class="text-sm font-medium">
                ${this.profile?.crawlconfigs?.map(
                  ({ id, name }) => html`
                    <li>
                      <a
                        class="text-neutral-600 hover:underline"
                        href=${`${this.navigate.orgBasePath}/workflows/crawl/${id}`}
                        @click=${this.navigate.link}
                      >
                        ${name}
                      </a>
                    </li>
                  `,
                )}
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      <div class="flex flex-col gap-5 lg:flex-row">
        <section class="flex-1">
          <h2 class="text-lg font-medium leading-none">
            ${msg("Browser Profile")}
          </h2>
          ${when(this.isCrawler, () =>
            this.browserId || this.isBrowserLoading
              ? html`
                  <div id="profileBrowserContainer" class="flex h-screen py-3">
                    <div class="flex flex-1 flex-col gap-2">
                      <btrix-profile-browser
                        class="flex-1 overflow-hidden rounded border"
                        .authState=${this.authState}
                        orgId=${this.orgId}
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
                  <sl-button @click=${this.startBrowserPreview}>
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
        <sl-button
          size="small"
          @click=${() => void this.discardChangesDialog?.show()}
        >
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
          <sl-menu-item @click=${this.startBrowserPreview}>
            <sl-icon slot="prefix" name="gear"></sl-icon>
            ${msg("Configure Browser Profile")}
          </sl-menu-item>
          <sl-menu-item @click=${() => void this.duplicateProfile()}>
            <sl-icon slot="prefix" name="files"></sl-icon>
            ${msg("Duplicate Profile")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => void this.deleteProfile()}
          >
            <sl-icon slot="prefix" name="trash3"></sl-icon>
            ${msg("Delete")}
          </sl-menu-item>
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderEditProfile() {
    if (!this.profile) return;

    return html`
      <form @submit=${this.onSubmitEdit}>
        <div class="mb-5">
          <sl-input
            name="name"
            label=${msg("Name")}
            autocomplete="off"
            value=${this.profile.name}
            required
          ></sl-input>
        </div>

        <div class="mb-5">
          <sl-textarea
            name="description"
            label=${msg("Description")}
            rows="2"
            autocomplete="off"
            value=${this.profile.description || ""}
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
        })}`,
      );
    } catch (e) {
      this.isBrowserLoading = false;

      this.notify.toast({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile() {
    const profileName = this.profile!.name;

    try {
      const data = await this.api.fetch<Profile & { error: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profile!.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      if (data.error && data.crawlconfigs) {
        this.notify.toast({
          message: msg(
            html`Could not delete <strong>${profileName}</strong>, in use by
              <strong
                >${data.crawlconfigs.map(({ name }) => name).join(", ")}</strong
              >. Please remove browser profile from Workflow to continue.`,
          ),
          variant: "warning",
          icon: "exclamation-triangle",
          duration: 15000,
        });
      } else {
        this.navigate.to(`${this.navigate.orgBasePath}/browser-profiles`);

        this.notify.toast({
          message: msg(html`Deleted <strong>${profileName}</strong>.`),
          variant: "success",
          icon: "check2-circle",
        });
      }
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't delete browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
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
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  private async deleteBrowser(id: string) {
    return this.api.fetch(
      `/orgs/${this.orgId}/profiles/browser/${id}`,
      this.authState!,
      {
        method: "DELETE",
      },
    );
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
      });
    }
  }

  private async getProfile() {
    const data = await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${this.profileId}`,
      this.authState!,
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
        this.authState!,
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
      });
    }

    this.isSubmittingBrowserChange = false;
  }

  private async onSubmitEdit(e: SubmitEvent) {
    e.preventDefault();

    this.isSubmittingProfileChange = true;

    const formData = new FormData(e.target as HTMLFormElement);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    const params = {
      name,
      description,
    };

    try {
      const data = await this.api.fetch<{ updated: boolean }>(
        `/orgs/${this.orgId}/profiles/${this.profileId}`,
        this.authState!,
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
      });
    }

    this.isSubmittingProfileChange = false;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
