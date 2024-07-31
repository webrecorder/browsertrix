import { localized, msg, str } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";
import queryString from "query-string";

import type { Dialog } from "@/components/ui/dialog";
import { type SelectCrawlerChangeEvent } from "@/components/ui/select-crawler";
import LiteElement, { html } from "@/utils/LiteElement";

@localized()
@customElement("btrix-new-browser-profile-dialog")
export class NewBrowserProfileDialog extends LiteElement {
  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private isSubmitting = false;

  @state()
  private crawlerChannel = "default";

  @query("btrix-dialog")
  private readonly dialog?: Dialog;

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
            @on-change=${(e: SelectCrawlerChangeEvent) =>
              (this.crawlerChannel = e.detail.value!)}
          ></btrix-select-crawler>
        </div>
        <input class="invisible size-0" type="submit" />
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
          variant="success"
          size="small"
          ?loading=${this.isSubmitting}
          ?disabled=${this.isSubmitting}
          @click=${() => this.dialog?.submit()}
          >${msg("Start Browsing")}</sl-button
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
        message: msg("Starting up browser for new profile..."),
        variant: "success",
        icon: "check2-circle",
      });
      await this.hideDialog();
      this.navTo(
        `${this.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?${queryString.stringify({
          url,
          name: msg("My Profile"),
          crawlerChannel: this.crawlerChannel,
        })}`,
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
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }
}
