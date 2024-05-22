import { localized, msg, str } from "@lit/localize";
import { type SlDropdown } from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { capitalize } from "lodash/fp";

import type { Profile } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { getLocale } from "@/utils/localization";

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

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  disconnectedCallback() {
    if (this.browserId) {
      void this.deleteBrowser(this.browserId);
    }
  }

  firstUpdated() {
    void this.fetchProfile();
  }

  render() {
    const none = html`<span class="text-neutral-400">${msg("None")}</span>`;
    console.log(this.profile?.crawlconfigs);

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

      <section class="mb-3 rounded-lg border px-4 py-2">
        <btrix-desc-list horizontal>
          <btrix-desc-list-item label=${msg("Created At")}>
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
              : nothing}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Crawler Release Channel")}>
            ${this.profile
              ? this.profile.crawlerChannel
                ? capitalize(this.profile.crawlerChannel)
                : none
              : nothing}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Crawl Workflows")}>
            ${this.profile?.crawlconfigs?.length
              ? html`<ul class="text-sm font-medium">
                  ${this.profile.crawlconfigs.map(
                    ({ id, name }) => html`
                      <li>
                        <a
                          class="text-neutral-600 hover:underline"
                          href=${`${this.navigate.orgBasePath}/workflows/crawl/${id}`}
                          @click=${this.navigate.link}
                        >
                          ${name || msg("(no name)")}
                        </a>
                      </li>
                    `,
                  )}
                </ul>`
              : none}
          </btrix-desc-list-item>
        </btrix-desc-list>
      </section>

      <section class="mb-5">
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
        <div class="rounded border p-5">
          ${this.profile
            ? this.profile.description ||
              html`
                <div class="text-center text-neutral-400">
                  ${msg("No description added.")}
                </div>
              `
            : nothing}
        </div>
      </section>

      <div class="flex flex-col gap-5 lg:flex-row">
        <section class="flex-1">
          <header class="mb-3">
            <h2 class="text-lg font-medium leading-none">
              ${msg("Browser Profile")}
            </h2>
          </header>
          ${when(this.isCrawler, () =>
            this.browserId || this.isBrowserLoading
              ? html`
                  <div
                    class="flex h-screen flex-col overflow-hidden rounded-lg border"
                  >
                    <btrix-profile-browser
                      class="flex-1"
                      .authState=${this.authState}
                      orgId=${this.orgId}
                      browserId=${ifDefined(this.browserId)}
                      .origins=${this.profile?.origins}
                      @load=${() => (this.isBrowserLoaded = true)}
                    ></btrix-profile-browser>
                    <div class="flex-0 border-t">
                      ${this.renderBrowserProfileControls()}
                    </div>
                  </div>
                `
              : html`<div
                  class="flex aspect-video flex-col items-center justify-center rounded-lg border bg-neutral-50"
                >
                  <p
                    class="mx-auto mb-4 max-w-prose text-center text-neutral-600"
                  >
                    ${msg(
                      "Edit the profile to make changes or view its present configuration",
                    )}
                  </p>
                  <sl-button @click=${this.startBrowserPreview}>
                    <sl-icon slot="prefix" name="pencil-square"></sl-icon>
                    ${msg("Edit Browser Profile")}
                  </sl-button>
                </div>`,
          )}
        </section>
        ${when(
          !(this.browserId || this.isBrowserLoading),
          this.renderVisitedSites,
        )}
      </div>

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
        <div class="max-w-prose">
          <p class="mx-1 text-xs text-neutral-500">
            ${msg(
              "Interact with the browsing tool to set up the browser profile.  Workflows that use this browser profile will behave as if they have logged into the same websites and have the same cookies that have been set here.",
            )}
          </p>
        </div>
        <div>
          <sl-button size="small" @click=${this.cancelEditBrowser}
            >${msg("Cancel")}</sl-button
          >
          <sl-button
            variant="primary"
            size="small"
            ?loading=${this.isSubmittingBrowserChange}
            ?disabled=${this.isSubmittingBrowserChange || !this.isBrowserLoaded}
            @click=${this.saveBrowser}
            >${msg("Save Browser Profile")}</sl-button
          >
        </div>
      </div>
    `;
  }

  private renderMenu() {
    return html`
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button size="small" slot="trigger" caret
          >${msg("Actions")}</sl-button
        >

        <ul
          class="whitespace-nowrap bg-white text-left text-sm text-neutral-800"
          role="menu"
        >
          <li
            class="cursor-pointer p-2 hover:bg-zinc-100"
            role="menuitem"
            @click=${(e: Event) => {
              void (e.target as HTMLElement)
                .closest<SlDropdown>("sl-dropdown")!
                .hide();
              this.isEditDialogOpen = true;
            }}
          >
            <sl-icon
              class="inline-block px-1 align-middle"
              name="pencil"
            ></sl-icon>
            <span class="inline-block pr-2 align-middle"
              >${msg("Edit Metadata")}</span
            >
          </li>
          <li
            class="cursor-pointer p-2 hover:bg-zinc-100"
            role="menuitem"
            @click=${() => void this.duplicateProfile()}
          >
            <sl-icon
              class="inline-block px-1 align-middle"
              name="files"
            ></sl-icon>
            <span class="inline-block pr-2 align-middle"
              >${msg("Duplicate Profile")}</span
            >
          </li>
          <hr />
          <li
            class="cursor-pointer p-2 text-danger hover:bg-danger hover:text-white"
            role="menuitem"
            @click=${() => {
              void this.deleteProfile();
            }}
          >
            <sl-icon
              class="inline-block px-1 align-middle"
              name="trash3"
            ></sl-icon>
            <span class="inline-block pr-2 align-middle">${msg("Delete")}</span>
          </li>
        </ul>
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

  private async startBrowserPreview() {
    if (!this.profile) return;

    this.isBrowserLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.browserId = data.browserid;
      this.isBrowserLoading = false;
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
        }?name=${window.encodeURIComponent(
          this.profile.name,
        )}&description=${window.encodeURIComponent(
          this.profile.description || "",
        )}&profileId=${window.encodeURIComponent(this.profile.id)}&navigateUrl=`,
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

    if (
      !window.confirm(
        msg(
          "Save browser changes to profile? You will need to re-load the browsing tool to make additional changes.",
        ),
      )
    ) {
      return;
    }

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
