import { localized, msg, str } from "@lit/localize";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import type { BrowserConnectionChange } from "@/features/browser-profiles/profile-browser";
import { page } from "@/layouts/page";
import { type Breadcrumb } from "@/layouts/pageHeader";
import { OrgTab } from "@/routes";
import { CrawlerChannelImage } from "@/types/crawler";
import { isApiError } from "@/utils/api";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-new
 *  browserId=${browserId}
 * ></btrix-browser-profiles-new>
 * ```
 */
@customElement("btrix-browser-profiles-new")
@localized()
export class BrowserProfilesNew extends BtrixElement {
  @property({ type: String })
  browserId!: string;

  @property({ type: Object, attribute: false })
  browserParams: {
    url: string;
    name?: string;
    origins?: string[];
    crawlerChannel?: string;
    profileId?: string;
    proxyId?: string;
  } = {
    url: "",
    name: "",
  };

  @state()
  private isSubmitting = false;

  @state()
  private isDialogVisible = false;

  @state()
  private isBrowserLoaded = false;

  @query("#discardDialog")
  private readonly discardDialog?: Dialog | null;

  disconnectedCallback(): void {
    void this.closeBrowser();
    super.disconnectedCallback();
  }

  render() {
    const { profileId, name, origins } = this.browserParams;

    let breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}`,
        content: msg("Browser Profiles"),
      },
    ];
    if (profileId && name) {
      breadcrumbs = [
        ...breadcrumbs,
        {
          href: `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}/profile/${profileId}`,
          content: name,
        },
        {
          content: origins
            ? msg("Configure Profile")
            : msg("Duplicate Profile"),
        },
      ];
    }

    const badges = (profile: {
      crawlerChannel?: string;
      proxyId?: string | null;
    }) => {
      return html`<div class="flex flex-wrap gap-3 whitespace-nowrap ">
        ${when(
          profile.crawlerChannel,
          (channel) =>
            html`<btrix-badge class="font-monostyle">
              ${capitalize(channel)} ${msg("Channel")}</btrix-badge
            >`,
        )}
        ${when(
          profile.proxyId,
          (proxy) =>
            html`<btrix-badge class="font-monostyle">
              ${proxy} ${msg("Proxy")}</btrix-badge
            >`,
        )}
      </div> `;
    };

    const header = {
      breadcrumbs,
      title:
        profileId && name
          ? origins
            ? name
            : msg(str`Configure Duplicate of ${name}`)
          : msg("New Browser Profile"),
      secondary: badges(this.browserParams),
      actions: html`<sl-button
        size="small"
        ?disabled=${this.appState.userGuideOpen}
        @click=${() => {
          this.dispatchEvent(
            new CustomEvent<BtrixUserGuideShowEvent["detail"]>(
              "btrix-user-guide-show",
              {
                detail: { path: "browser-profiles" },
                bubbles: true,
                composed: true,
              },
            ),
          );
        }}
      >
        <sl-icon slot="prefix" name="book"></sl-icon>
        ${msg("User Guide")}
      </sl-button>`,
      border: false,
    } satisfies Parameters<typeof page>[0];

    return html`
      ${page(header, this.renderPage)}

      <btrix-dialog
        .label=${msg(str`Save Browser Profile`)}
        .open=${this.isDialogVisible}
        @sl-request-close=${() => (this.isDialogVisible = false)}
      >
        ${this.renderForm()}
      </btrix-dialog>

      <btrix-dialog
        id="discardDialog"
        .label=${msg("Cancel Profile Creation?")}
      >
        ${msg(
          "Are you sure you want to discard changes to this browser profile?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            .autofocus=${true}
            @click=${() => void this.discardDialog?.hide()}
          >
            ${msg("No, Continue Browsing")}
          </sl-button>
          <sl-button
            size="small"
            variant="danger"
            @click=${() => {
              void this.discardDialog?.hide();
              void this.closeBrowser();
            }}
            >${msg("Yes, Cancel")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderPage = () => {
    return html` <div class="mb-3 overflow-hidden rounded-lg border">
        <btrix-profile-browser
          browserId=${this.browserId}
          initialNavigateUrl=${ifDefined(this.browserParams.url)}
          @btrix-browser-load=${() => (this.isBrowserLoaded = true)}
          @btrix-browser-reload=${this.onBrowserReload}
          @btrix-browser-error=${this.onBrowserError}
          @btrix-browser-connection-change=${this.onBrowserConnectionChange}
        ></btrix-profile-browser>
      </div>

      <div
        class="flex-0 sticky bottom-2 z-50 -mx-1 rounded-lg border bg-neutral-0 shadow"
      >
        ${this.renderBrowserProfileControls()}
      </div>`;
  };

  private async onBrowserError() {
    this.isBrowserLoaded = false;
  }

  private async onBrowserConnectionChange(
    e: CustomEvent<BrowserConnectionChange>,
  ) {
    this.isBrowserLoaded = e.detail.connected;
  }

  private onCancel() {
    if (!this.isBrowserLoaded) {
      void this.closeBrowser();
    } else {
      void this.discardDialog?.show();
    }
  }

  private async closeBrowser() {
    this.isBrowserLoaded = false;

    if (this.browserId) {
      await this.deleteBrowser(this.browserId);
    }
    this.navigate.to(`${this.navigate.orgBasePath}/browser-profiles`);
  }

  private renderBrowserProfileControls() {
    const { profileId, name, origins } = this.browserParams;
    const shouldSave = profileId && name && origins;

    return html`
      <div class="flex justify-between p-4">
        <sl-button size="small" @click="${this.onCancel}">
          ${msg("Cancel")}
        </sl-button>
        <div>
          <sl-button
            variant=${shouldSave ? "primary" : "success"}
            size="small"
            ?disabled=${!this.isBrowserLoaded || this.isSubmitting}
            ?loading=${Boolean(shouldSave && this.isSubmitting)}
            @click=${() => {
              if (shouldSave) {
                void this.saveProfile({ name });
              } else {
                this.isDialogVisible = true;
              }
            }}
          >
            ${msg(shouldSave ? "Save Profile" : "Finish Browsing")}
          </sl-button>
        </div>
      </div>
    `;
  }

  private renderForm() {
    const { profileId, name, origins } = this.browserParams;
    const nameValue =
      profileId && name
        ? // Updating profile
          origins
          ? name
          : // Duplicating profile
            `${name} ${msg("Copy")}`
        : // New profile
          "";

    return html`<form @submit=${this.onSubmit}>
      <div class="grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          placeholder=${msg("Example (example.com)", {
            desc: "Example browser profile name",
          })}
          autocomplete="off"
          value=${nameValue}
          required
        ></sl-input>

        <sl-textarea
          name="description"
          label=${msg("Description")}
          help-text=${msg("Optional profile description")}
          placeholder=${msg("Example (example.com) login profile", {
            desc: "Example browser profile name",
          })}
          rows="2"
          autocomplete="off"
        ></sl-textarea>

        <div class="flex justify-between">
          <sl-button
            variant="default"
            size="small"
            @click=${() => (this.isDialogVisible = false)}
          >
            ${msg("Back")}
          </sl-button>

          <sl-button
            variant="primary"
            size="small"
            type="submit"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save Profile")}
          </sl-button>
        </div>
      </div>
    </form>`;
  }

  private async onBrowserReload() {
    const { url } = this.browserParams;
    if (!url) {
      console.debug("no start url");
      return;
    }

    const crawlerChannel =
      this.browserParams.crawlerChannel || CrawlerChannelImage.Default;
    const proxyId = this.browserParams.proxyId ?? null;
    const profileId = this.browserParams.profileId || undefined;
    const data = await this.createBrowser({
      url,
      crawlerChannel,
      proxyId,
      profileId,
    });

    this.navigate.to(
      `${this.navigate.orgBasePath}/browser-profiles/profile/browser/${
        data.browserid
      }?${queryString.stringify({
        url,
        name: this.browserParams.name,
        crawlerChannel,
        proxyId,
        profileId,
      })}`,
    );
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();

    const formData = new FormData(event.target as HTMLFormElement);
    const params = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      crawlerChannel: this.browserParams.crawlerChannel,
      proxyId: this.browserParams.proxyId,
    };

    await this.saveProfile(params);
  }

  private async saveProfile(params: {
    name: string;
    description?: string;
    crawlerChannel?: string;
    proxyId?: string | null;
  }) {
    this.isSubmitting = true;

    try {
      let data: { id?: string; updated?: boolean; detail?: string } | undefined;
      let retriesLeft = 300;

      while (retriesLeft > 0) {
        if (this.browserParams.profileId) {
          data = await this.api.fetch<{
            updated?: boolean;
            detail?: string;
          }>(`/orgs/${this.orgId}/profiles/${this.browserParams.profileId}`, {
            method: "PATCH",
            body: JSON.stringify({
              browserid: this.browserId,
              name: params.name,
            }),
          });

          if (data.updated !== undefined) {
            break;
          }
        } else {
          data = await this.api.fetch<{ id?: string; detail?: string }>(
            `/orgs/${this.orgId}/profiles`,
            {
              method: "POST",
              body: JSON.stringify({
                ...params,
                browserid: this.browserId,
              }),
            },
          );
        }

        if (data.id) {
          break;
        }
        if (data.detail === "waiting_for_browser") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          throw new Error("unknown response");
        }

        retriesLeft -= 1;
      }

      if (!retriesLeft) {
        throw new Error("too many retries waiting for browser");
      }

      if (!data) {
        throw new Error("unknown response");
      }

      this.notify.toast({
        message: msg("Successfully saved browser profile."),
        variant: "success",
        icon: "check2-circle",
        id: "browser-profile-save-status",
      });

      this.navigate.to(
        `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}/profile/${this.browserParams.profileId || data.id}`,
      );
    } catch (e) {
      console.debug(e);

      this.isSubmitting = false;

      let message = msg("Sorry, couldn't save browser profile at this time.");

      if (isApiError(e) && e.statusCode === 403) {
        if (e.details === "storage_quota_reached") {
          message = msg(
            "Your org does not have enough storage to save this browser profile.",
          );
        } else {
          message = msg(
            "You do not have permission to update browser profiles.",
          );
        }
      }

      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-save-status",
      });
    }
  }

  private async createBrowser({
    url,
    crawlerChannel,
    proxyId,
    profileId,
  }: {
    url: string;
    crawlerChannel: string;
    proxyId: string | null;
    profileId?: string;
  }) {
    const params = {
      url,
      crawlerChannel,
      proxyId,
      profileId,
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
    try {
      const data = await this.api.fetch(
        `/orgs/${this.orgId}/profiles/browser/${id}`,
        {
          method: "DELETE",
        },
      );

      return data;
    } catch (e) {
      // TODO Investigate DELETE returning 404
      console.debug(e);
    }
  }
}
