import { localized, msg, str } from "@lit/localize";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import queryString from "query-string";

import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";

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
export class BrowserProfilesNew extends LiteElement {
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

  @state()
  private isSubmitting = false;

  @state()
  private isDialogVisible = false;

  disconnectedCallback(): void {
    if (this.browserId) {
      void this.deleteBrowser(this.browserId);
    }
    super.disconnectedCallback();
  }

  render() {
    return html`
      <div class="mb-7">
        <a
          class="text-sm font-medium text-neutral-500 hover:text-neutral-600"
          href=${this.browserParams.profileId
            ? `${this.orgBasePath}/browser-profiles/profile/${this.browserParams.profileId}`
            : `${this.orgBasePath}/browser-profiles`}
          @click=${this.navLink}
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
          @btrix-browser-reload=${this.onBrowserReload}
        ></btrix-profile-browser>

        <div
          class="sticky bottom-2 z-10 mb-3 flex items-center justify-end rounded-lg border bg-neutral-0 p-2 shadow"
        >
          <sl-button
            variant="success"
            size="small"
            @click=${() => (this.isDialogVisible = true)}
          >
            ${msg("Finish Browsing")}
          </sl-button>
        </div>
      </div>

      <btrix-dialog
        .label=${msg(str`Save Browser Profile`)}
        .open=${this.isDialogVisible}
        @sl-request-close=${() => (this.isDialogVisible = false)}
      >
        ${this.renderForm()}
      </btrix-dialog>
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

    this.navTo(
      `${this.orgBasePath}/browser-profiles/profile/browser/${
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
      const data = await this.apiFetch<{ id: string }>(
        `/orgs/${this.orgId}/profiles`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        },
      );

      this.notify({
        message: msg("Successfully created browser profile."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(`${this.orgBasePath}/browser-profiles/profile/${data.id}`);
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

      this.notify({
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

    return this.apiFetch<{ browserid: string }>(
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
      const data = await this.apiFetch(
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
