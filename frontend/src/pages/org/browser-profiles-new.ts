import { localized, msg, str } from "@lit/localize";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import queryString from "query-string";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { BrowserConnectionChange } from "@/features/browser-profiles/profile-browser";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-new
 *  authState=${authState}
 *  orgId=${orgId}
 *  browserId=${browserId}
 * ></btrix-browser-profiles-new>
 * ```
 */
@localized()
@customElement("btrix-browser-profiles-new")
export class BrowserProfilesNew extends TailwindElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  browserId!: string;

  @property({ type: Object, attribute: false })
  browserParams: {
    name: string;
    url: string;
    description?: string;
    crawlerChannel?: string;
    profileId?: string | null;
    navigateUrl?: string;
  } = {
    name: "",
    url: "",
  };

  private readonly api = new APIController(this);
  private readonly notify = new NotifyController(this);
  private readonly nav = new NavigateController(this);

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
    return html`
      <div class="mb-7">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${this.browserParams.profileId
            ? `${this.nav.orgBasePath}/browser-profiles/profile/${this.browserParams.profileId}`
            : `${this.nav.orgBasePath}/browser-profiles`}
          @click=${this.nav.link}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${this.browserParams.profileId
              ? msg("Back to Profile")
              : msg("Back to Browser Profiles")}</span
          >
        </a>
      </div>

      <header class="mb-3">
        <h1 class="min-w-0 flex-1 truncate text-xl font-medium leading-7">
          ${msg("New Browser Profile")}
        </h1>
      </header>

      <p class="mb-5 leading-normal text-neutral-700">
        ${msg(
          "Workflows that use this browser profile will behave as if they have logged into the same websites and have the same web cookies.",
        )}
        <br />
        ${msg(html`
          It is highly recommended to create dedicated accounts to use when
          crawling. For details, refer to
          <a
            class="text-primary hover:text-indigo-400"
            href="https://docs.browsertrix.com/user-guide/browser-profiles/"
            target="_blank"
          >
            ${msg("browser profile best practices")}</a
          >.
        `)}
      </p>

      ${this.browserParams.profileId
        ? html`
            <div class="mb-2">
              <btrix-alert class="text-sm" variant="info"
                >${msg(
                  html`Extending <strong>${this.browserParams.name}</strong>`,
                )}</btrix-alert
              >
            </div>
          `
        : ""}

      <div class="sticky top-0 flex h-screen flex-col gap-2">
        <btrix-profile-browser
          class="flex-1 overflow-hidden rounded-lg border"
          .authState=${this.authState}
          orgId=${this.orgId}
          browserId=${this.browserId}
          initialNavigateUrl=${ifDefined(this.browserParams.navigateUrl)}
          @btrix-browser-load=${() => (this.isBrowserLoaded = true)}
          @btrix-browser-reload=${this.onBrowserReload}
          @btrix-browser-error=${this.onBrowserError}
          @btrix-browser-connection-change=${this.onBrowserConnectionChange}
        ></btrix-profile-browser>

        <div
          class="flex-0 sticky bottom-2 rounded-lg border bg-neutral-0 shadow"
        >
          ${this.renderBrowserProfileControls()}
        </div>
      </div>

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
        ${msg("Are you sure you want to cancel creating a browser profile?")}
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
    this.nav.to(`${this.nav.orgBasePath}/browser-profiles`);
  }

  private renderBrowserProfileControls() {
    return html`
      <div class="flex justify-between p-4">
        <sl-button size="small" @click="${this.onCancel}">
          ${msg("Cancel")}
        </sl-button>
        <div>
          <sl-button
            variant="success"
            size="small"
            ?disabled=${!this.isBrowserLoaded}
            @click=${() => (this.isDialogVisible = true)}
          >
            ${msg("Save New Profile...")}
          </sl-button>
        </div>
      </div>
    `;
  }

  private renderForm() {
    return html`<form @submit=${this.onSubmit}>
      <div class="grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          placeholder=${msg("Example (example.com)", {
            desc: "Example browser profile name",
          })}
          autocomplete="off"
          value=${this.browserParams.profileId && this.browserParams.name
            ? msg(str`${this.browserParams.name} Copy`)
            : this.browserParams.name || msg("My Profile")}
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
          value=${this.browserParams.description || ""}
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

    const crawlerChannel = this.browserParams.crawlerChannel || "default";
    const data = await this.createBrowser({
      url,
      crawlerChannel,
    });

    this.nav.to(
      `${this.nav.orgBasePath}/browser-profiles/profile/browser/${
        data.browserid
      }?${queryString.stringify({
        url,
        name: this.browserParams.name || msg("My Profile"),
        crawlerChannel,
      })}`,
    );
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const params = {
      browserid: this.browserId,
      name: formData.get("name"),
      description: formData.get("description"),
      crawlerChannel: this.browserParams.crawlerChannel,
    };

    try {
      const data = await this.api.fetch<{ id: string }>(
        `/orgs/${this.orgId}/profiles`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );

      this.notify.toast({
        message: msg("Successfully created browser profile."),
        variant: "success",
        icon: "check2-circle",
      });

      this.nav.to(
        `${this.nav.orgBasePath}/browser-profiles/profile/${data.id}`,
      );
    } catch (e) {
      this.isSubmitting = false;

      let message = msg("Sorry, couldn't create browser profile at this time.");

      if (isApiError(e) && e.statusCode === 403) {
        if (e.details === "storage_quota_reached") {
          message = msg(
            "Your org does not have enough storage to save this browser profile.",
          );
        } else {
          message = msg(
            "You do not have permission to create browser profiles.",
          );
        }
      }

      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
  private async createBrowser({
    url,
    crawlerChannel,
  }: {
    url: string;
    crawlerChannel: string;
  }) {
    const params = {
      url,
      crawlerChannel,
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
    try {
      const data = await this.api.fetch(
        `/orgs/${this.orgId}/profiles/browser/${id}`,
        this.authState!,
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
