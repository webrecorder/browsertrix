import { state, property, queryAsync, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type { Dialog } from "@/components/ui/dialog";
import { type SelectCrawlerChangeEvent } from "@/components/ui/select-crawler";

@localized()
@customElement("btrix-new-browser-profile-dialog")
export class NewBrowserProfileDialog extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @state()
  private crawlerChannel = "default";

  @queryAsync("#browserProfileForm")
  private readonly form!: Promise<HTMLFormElement>;

  render() {
    return html` <btrix-dialog
      .label=${msg(str`Create a New Browser Profile`)}
      .open=${this.open}
      @sl-initial-focus=${async (e: CustomEvent) => {
        const nameInput = (await this.form).querySelector<SlInput>(
          'sl-input[name="url"]',
        );
        if (nameInput) {
          e.preventDefault();
          nameInput.focus();
        }
      }}
    >
      <form
        id="browserProfileForm"
        @reset=${this.onReset}
        @submit=${this.onSubmit}
      >
        <div class="grid">
          <div>
            <label
              id="startingUrlLabel"
              class="text-sm leading-normal"
              style="margin-bottom: var(--sl-spacing-3x-small)"
              >${msg("Starting URL")}
            </label>

            <div class="flex">
              <sl-input
                class="grow"
                name="url"
                placeholder=${msg("https://example.com")}
                autocomplete="off"
                aria-labelledby="startingUrlLabel"
                required
              >
              </sl-input>
            </div>
          </div>
        </div>
        <div class="mt-1">
          <btrix-select-crawler
            orgId=${this.orgId}
            .crawlerChannel=${this.crawlerChannel}
            .authState=${this.authState}
            @on-change=${(e: SelectCrawlerChangeEvent) =>
              (this.crawlerChannel = e.detail.value!)}
          ></btrix-select-crawler>
        </div>
        <input class="invisible h-0 w-0" type="submit" />
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button
          size="small"
          @click=${async () => {
            // Using reset method instead of type="reset" fixes
            // incorrect getRootNode in Chrome
            (await this.form).reset();
          }}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          variant="primary"
          size="small"
          ?loading=${this.isSubmitting}
          ?disabled=${this.isSubmitting}
          @click=${async () => {
            // Using submit method instead of type="submit" fixes
            // incorrect getRootNode in Chrome
            const form = await this.form;
            const submitInput = form.querySelector<HTMLElement>(
              'input[type="submit"]',
            );
            form.requestSubmit(submitInput);
          }}
          >${msg("Start Profile Creator")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private async hideDialog() {
    void (await this.form).closest<Dialog>("btrix-dialog")?.hide();
  }

  private onReset() {
    void this.hideDialog();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    let url = formData.get("url") as string;

    try {
      url = url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }
      const data = await this.createBrowser({
        url: url,
        crawlerChannel: this.crawlerChannel,
      });

      this.notify({
        message: msg("Starting up browser for profile creation."),
        variant: "success",
        icon: "check2-circle",
      });
      await this.hideDialog();
      this.navTo(
        `${this.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          "My Profile",
        )}&description=&profileId=&crawlerChannel=${this.crawlerChannel}`,
      );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
    this.isSubmitting = false;
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

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
