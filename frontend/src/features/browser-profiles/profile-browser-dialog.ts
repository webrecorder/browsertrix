import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { badges } from "./templates/badges";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import {
  bgClass,
  type BrowserConnectionChange,
  type ProfileBrowser,
} from "@/features/browser-profiles/profile-browser";
import type {
  CreateBrowserOptions,
  ProfileUpdatedEvent,
} from "@/features/browser-profiles/types";
import { OrgTab } from "@/routes";
import type { Profile } from "@/types/crawler";
import { isApiError } from "@/utils/api";
import { tw } from "@/utils/tailwind";

/**
 * @fires btrix-updated
 */
@customElement("btrix-profile-browser-dialog")
@localized()
export class ProfileBrowserDialog extends BtrixElement {
  @property({ type: Object })
  profile?: Profile;

  @property({ type: Object })
  config?: CreateBrowserOptions & { name?: string };

  @property({ type: Boolean })
  duplicating = false;

  @property({ type: Boolean })
  open = false;

  @state()
  private isBrowserLoaded = false;

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("btrix-profile-browser")
  private readonly profileBrowser?: ProfileBrowser | null;

  #savedBrowserId?: string;

  private readonly browserIdTask = new Task(this, {
    task: async ([open, config], { signal }) => {
      if (!open || !config) return null;

      const browserId = this.browserIdTask.value;
      if (browserId && browserId !== this.#savedBrowserId) {
        // Delete previously created and unused browser
        void this.deleteBrowser(browserId, signal);
      }

      const { browserid } = await this.createBrowser(config, signal);

      return browserid;
    },
    args: () => [this.open, this.config] as const,
  });

  disconnectedCallback(): void {
    const browserId = this.browserIdTask.value;

    if (browserId && browserId !== this.#savedBrowserId) {
      void this.deleteBrowser(browserId);
    }

    super.disconnectedCallback();
  }

  private readonly saveProfileTask = new Task(this, {
    autoRun: false,
    task: async ([browserId, config], { signal }) => {
      if (!browserId || !config) return;

      try {
        const data = await this.saveProfile(
          {
            browserId,
            name:
              config.name ||
              this.profile?.name ||
              new URL(config.url).origin.slice(0, 50),
          },
          signal,
        );

        this.#savedBrowserId = browserId;

        this.dispatchEvent(
          new CustomEvent<ProfileUpdatedEvent["detail"]>("btrix-updated"),
        );

        return data;
      } catch (err) {
        let message = msg("Sorry, couldn't save browser profile at this time.");

        if (isApiError(err) && err.statusCode === 403) {
          if (err.details === "storage_quota_reached") {
            message = msg(
              "Your org does not have enough storage to save this browser profile.",
            );
          } else {
            message = msg(
              "You do not have permission to update browser profiles.",
            );
          }
        }

        throw message;
      }
    },
    args: () => [this.browserIdTask.value, this.config] as const,
  });

  render() {
    const isCrawler = this.appState.isCrawler;
    const creatingNew = this.duplicating || !this.profile;
    const saving = this.saveProfileTask.status === TaskStatus.PENDING;

    return html`<btrix-dialog
      class=${clsx(
        tw`[--body-spacing:0]`,
        tw`part-[panel]:h-screen part-[panel]:max-h-full part-[panel]:w-screen part-[panel]:max-w-full part-[panel]:rounded-none`,
        tw`part-[body]:flex part-[body]:flex-col`,
      )}
      .open=${this.open}
      no-header
      @sl-show=${() => {
        // Hide viewport scrollbar when full screen dialog is open
        document.documentElement.classList.add(tw`overflow-hidden`);
      }}
      @sl-hide=${() => {
        document.documentElement.classList.remove(tw`overflow-hidden`);
      }}
      @sl-after-hide=${() => this.closeBrowser()}
    >
      <header class="flex flex-wrap items-center gap-3 p-3">
        <div class="flex flex-1 items-center gap-3">
          <div class="border-r pr-3">
            <sl-icon-button
              name="x-lg"
              class="text-base"
              label=${msg("Close")}
              @click=${() => {
                this.saveProfileTask.abort();

                if (this.browserIdTask.value) {
                  void this.deleteBrowser(this.browserIdTask.value);
                }

                void this.dialog?.hide();
              }}
            >
            </sl-icon-button>
          </div>
          <div class="w-full overflow-hidden px-3">
            <div class="mb-2 flex min-w-80 items-center md:h-7">
              <h2
                id="title"
                class="text-base font-medium leading-none md:truncate"
              >
                ${this.config?.name || this.profile?.name}
              </h2>
              ${when(
                this.config?.url,
                (url) => html`
                  <sl-divider class="hidden md:block" vertical></sl-divider>
                  <btrix-code
                    class="mt-px hidden w-40 flex-1 md:block"
                    language="url"
                    value=${url}
                    truncate
                    noWrap
                  ></btrix-code>
                `,
              )}
            </div>
            ${when(
              (this.profile || this.config) && {
                ...this.profile,
                ...this.config,
              },
              badges,
            )}
          </div>
        </div>
        <div class="flex flex-1 items-center justify-end gap-3 md:grow-0">
          <div class="flex items-center gap-2">
            <sl-tooltip content=${msg("Enter Fullscreen")}>
              <sl-icon-button
                class="text-base"
                name="arrows-fullscreen"
                @click=${() => void this.profileBrowser?.enterFullscreen()}
              ></sl-icon-button>
            </sl-tooltip>
            <sl-tooltip content=${msg("Toggle Site List")}>
              <sl-icon-button
                class="text-base"
                name="layout-sidebar-reverse"
                @click=${() => this.profileBrowser?.toggleOrigins()}
              ></sl-icon-button>
            </sl-tooltip>
          </div>

          ${when(
            isCrawler,
            () => html`
              <btrix-popover
                content=${msg("Save disabled during load")}
                ?disabled=${this.isBrowserLoaded}
              >
                <div class="border-l pl-6 pr-3">
                  <sl-button
                    size="small"
                    variant="primary"
                    ?disabled=${!this.isBrowserLoaded || saving}
                    ?loading=${saving}
                    @click=${() => void this.submit()}
                  >
                    ${creatingNew ? msg("Create Profile") : msg("Save Profile")}
                  </sl-button>
                </div>
              </btrix-popover>
            `,
          )}
        </div>
      </header>

      <div class="${bgClass} size-full" aria-labelledby="title">
        ${this.browserIdTask.render({
          complete: (browserId) =>
            browserId
              ? html`<btrix-profile-browser
                  browserId=${browserId}
                  initialNavigateUrl=${ifDefined(this.config?.url)}
                  @btrix-browser-load=${this.onBrowserLoad}
                  @btrix-browser-reload=${this.onBrowserReload}
                  @btrix-browser-error=${this.onBrowserError}
                  @btrix-browser-connection-change=${this
                    .onBrowserConnectionChange}
                  hideControls
                  tabindex="0"
                  .autofocus=${true}
                ></btrix-profile-browser>`
              : nothing,
        })}
      </div>
    </btrix-dialog>`;
  }

  private readonly closeBrowser = () => {
    this.isBrowserLoaded = false;
  };

  private readonly onBrowserLoad = () => {
    this.isBrowserLoaded = true;
  };

  private readonly onBrowserReload = () => {
    this.isBrowserLoaded = false;
  };

  private readonly onBrowserError = () => {
    this.isBrowserLoaded = false;
  };

  private readonly onBrowserConnectionChange = (
    e: CustomEvent<BrowserConnectionChange>,
  ) => {
    this.isBrowserLoaded = e.detail.connected;
  };

  private async submit() {
    this.notify.toast({
      message: msg("Saving profile..."),
      variant: "primary",
      icon: "info-circle",
      id: "browser-profile-save-status",
      duration: Infinity,
    });

    try {
      const dialog = this.dialog;

      await this.saveProfileTask.run();

      if (this.saveProfileTask.value?.id) {
        void dialog?.hide();
        this.navigate.to(
          `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}/profile/${this.saveProfileTask.value.id}`,
        );
      } else {
        await dialog?.hide();
      }

      this.notify.toast({
        message: msg("Successfully saved browser profile."),
        variant: "success",
        icon: "check2-circle",
        id: "browser-profile-save-status",
      });
    } catch (err) {
      if (typeof err === "string") {
        this.notify.toast({
          message: err,
          variant: "danger",
          icon: "exclamation-octagon",
          id: "browser-profile-save-status",
        });
      } else {
        console.debug(err);
      }
    }
  }

  private async saveProfile(
    params: { browserId: string; name: string },
    signal: AbortSignal,
  ) {
    const profileId = !this.duplicating && this.profile?.id;
    const payload = {
      browserid: params.browserId,
      name: params.name,
    };

    let data: { id?: string; updated?: boolean; detail?: string } | undefined;
    let retriesLeft = 300;

    while (retriesLeft > 0) {
      if (profileId) {
        data = await this.api.fetch<{
          updated?: boolean;
          detail?: string;
        }>(`/orgs/${this.orgId}/profiles/${profileId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
          signal,
        });

        if (data.updated !== undefined) {
          break;
        }
      } else {
        data = await this.api.fetch<{ id?: string; detail?: string }>(
          `/orgs/${this.orgId}/profiles`,
          {
            method: "POST",
            body: JSON.stringify(payload),
            signal,
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

    return data;
  }

  private async createBrowser(
    params: CreateBrowserOptions,
    signal?: AbortSignal,
  ) {
    return this.api.fetch<{ browserid: string }>(
      `/orgs/${this.orgId}/profiles/browser`,
      {
        method: "POST",
        body: JSON.stringify(params),
        signal,
      },
    );
  }

  private async deleteBrowser(browserId: string, signal?: AbortSignal) {
    try {
      const data = await this.api.fetch(
        `/orgs/${this.orgId}/profiles/browser/${browserId}`,
        {
          method: "DELETE",
          signal,
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
}
