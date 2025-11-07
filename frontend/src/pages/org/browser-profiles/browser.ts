import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { BtrixUserGuideShowEvent } from "@/events/btrix-user-guide-show";
import type { BrowserConnectionChange } from "@/features/browser-profiles/profile-browser";
import {
  badges,
  badgesSkeleton,
} from "@/features/browser-profiles/templates/badges";
import { page } from "@/layouts/page";
import { type Breadcrumb } from "@/layouts/pageHeader";
import { OrgTab } from "@/routes";
import { CrawlerChannelImage, type Profile } from "@/types/crawler";
import { isApiError } from "@/utils/api";
import { isNotEqual } from "@/utils/is-not-equal";

@customElement("btrix-browser-profiles-browser-page")
@localized()
export class BrowserProfilesBrowserPage extends BtrixElement {
  @property({ type: String })
  profileId?: string;

  @property({ type: String })
  browserId?: string;

  @property({ type: Object, attribute: false, hasChanged: isNotEqual })
  config: {
    url: string;
    name?: string;
    crawlerChannel?: string;
    proxyId?: string;
  } = {
    url: "",
  };

  @state()
  private isSubmitting = false;

  @state()
  private isDialogVisible = false;

  @state()
  private isBrowserLoaded = false;

  @query("#discardDialog")
  private readonly discardDialog?: Dialog | null;

  private readonly profileTask = new Task(this, {
    task: async ([profileId], { signal }) => {
      if (!profileId) return;

      const profile = await this.getProfile(profileId, signal);

      return profile;
    },
    args: () => [this.profileId] as const,
  });

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.browserId) {
      void this.deleteBrowser(this.browserId);
    }
  }

  render() {
    if (!this.browserId) {
      return html`<div class="flex size-full items-center justify-center">
        <btrix-not-found></btrix-not-found>
      </div>`;
    }

    const profile = this.profileTask.value;

    let breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}`,
        content: msg("Browser Profiles"),
      },
    ];

    if (this.profileId) {
      breadcrumbs = [
        ...breadcrumbs,
        {
          href: `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}/profile/${this.profileId}`,
          content: profile?.name,
        },
        {
          content: msg("Configure Profile"),
        },
      ];
    }

    const header = {
      breadcrumbs,
      title: this.profileId ? profile?.name : msg("New Browser Profile"),
      secondary: when(
        this.profileId
          ? {
              ...profile,
              ...this.config,
            }
          : this.config,
        badges,
        badgesSkeleton,
      ),
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
              this.closeBrowser();
            }}
            >${msg("Yes, Cancel")}
          </sl-button>
        </div>
      </btrix-dialog>
    `;
  }

  private readonly renderPage = () => {
    if (!this.browserId)
      return html`<btrix-alert variant="danger">
        ${msg("Invalid browser")}
      </btrix-alert>`;

    return html`<div class="mb-3 overflow-hidden rounded-lg border">
        <btrix-profile-browser
          browserId=${this.browserId}
          initialNavigateUrl=${ifDefined(this.config.url)}
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
      this.closeBrowser();
    } else {
      void this.discardDialog?.show();
    }
  }

  private closeBrowser() {
    this.isBrowserLoaded = false;

    if (this.browserId) {
      void this.deleteBrowser(this.browserId);
    }

    this.navigate.to(
      `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}${this.profileId ? `/profile/${this.profileId}` : ""}`,
    );
  }

  private renderBrowserProfileControls() {
    const shouldSave = Boolean(this.profileId);
    const disabled =
      (shouldSave && !this.profileTask.value) || !this.isBrowserLoaded;

    return html`
      <div class="flex justify-between p-4">
        <sl-button size="small" @click="${this.onCancel}">
          ${msg("Cancel")}
        </sl-button>
        <btrix-popover
          content=${msg("Save is disabled while browser is loading")}
          ?disabled=${!disabled}
        >
          <sl-button
            variant=${shouldSave ? "primary" : "success"}
            size="small"
            ?disabled=${disabled || this.isSubmitting}
            ?loading=${shouldSave && this.isSubmitting}
            @click=${() => {
              if (shouldSave && this.profileTask.value) {
                void this.saveProfile({ name: this.profileTask.value.name });
              } else {
                this.isDialogVisible = true;
              }
            }}
          >
            ${msg(this.profileId ? "Save Profile" : "Finish Browsing")}
          </sl-button>
        </btrix-popover>
      </div>
    `;
  }

  private renderForm() {
    if (this.profileId && !this.profileTask.value) {
      return;
    }

    const nameValue = this.profileTask.value
      ? this.profileTask.value.name
      : this.config.name || "";

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
    const { url } = this.config;
    if (!url) {
      console.debug("no start url");
      return;
    }

    const crawlerChannel =
      this.config.crawlerChannel || CrawlerChannelImage.Default;
    const proxyId = this.config.proxyId ?? null;
    const profileId = this.profileId || undefined;
    const data = await this.createBrowser({
      url,
      crawlerChannel,
      proxyId,
      profileId,
    });

    this.navigate.to(
      `${this.navigate.orgBasePath}/browser-profiles/profile${this.profileId ? `/${this.profileId}` : ""}/browser/${
        data.browserid
      }?${queryString.stringify({
        url,
        crawlerChannel,
        proxyId,
      })}`,
    );
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const params = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      crawlerChannel: this.config.crawlerChannel,
      proxyId: this.config.proxyId,
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
        if (this.profileId) {
          data = await this.api.fetch<{
            updated?: boolean;
            detail?: string;
          }>(`/orgs/${this.orgId}/profiles/${this.profileId}`, {
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
        `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}/profile/${this.profileId || data.id}`,
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
    } catch (err) {
      if (isApiError(err) && err.statusCode === 404) {
        // Safe to ignore, since unloaded browser will have already been deleted
      } else {
        console.debug(err);
      }
    }
  }

  private async getProfile(profileId: string, signal: AbortSignal) {
    return await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${profileId}`,
      { signal },
    );
  }
}
