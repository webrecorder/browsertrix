import { localized, msg } from "@lit/localize";
import { type SlInput } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAsync,
  state,
} from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type SelectCrawlerChangeEvent } from "@/components/ui/select-crawler";
import { type SelectCrawlerProxyChangeEvent } from "@/components/ui/select-crawler-proxy";
import {
  CrawlerChannelImage,
  type CrawlerChannel,
  type Proxy,
} from "@/types/crawler";

@customElement("btrix-new-browser-profile-dialog")
@localized()
export class NewBrowserProfileDialog extends BtrixElement {
  @property({ type: String })
  defaultUrl?: string;

  @property({ type: String })
  defaultProxyId?: string;

  @property({ type: String })
  defaultCrawlerChannel?: string;

  @property({ type: Array })
  proxyServers?: Proxy[];

  @property({ type: Array })
  crawlerChannels?: CrawlerChannel[];

  @property({ type: Boolean })
  open = false;

  @state()
  browserOpen = false;

  @state()
  private name?: string;

  @state()
  private url?: string;

  @state()
  private crawlerChannel: CrawlerChannel["id"] = CrawlerChannelImage.Default;

  @state()
  private proxyId: string | null = null;

  @query("btrix-dialog")
  private readonly dialog?: Dialog;

  @queryAsync("#browserProfileForm")
  private readonly form!: Promise<HTMLFormElement>;

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("defaultProxyId") && this.defaultProxyId) {
      this.proxyId = this.proxyId || this.defaultProxyId;
    }

    if (
      changedProperties.has("defaultCrawlerChannel") &&
      this.defaultCrawlerChannel
    ) {
      this.crawlerChannel =
        (this.crawlerChannel !== CrawlerChannelImage.Default &&
          this.crawlerChannel) ||
        this.defaultCrawlerChannel;
    }
  }

  render() {
    const channels = this.crawlerChannels;
    const proxyServers = this.proxyServers;
    const showChannels = channels && channels.length > 1;
    const showProxies = proxyServers?.length;

    return html`
      <btrix-dialog
        .label=${msg("New Browser Profile")}
        .open=${this.open}
        @sl-initial-focus=${async (e: CustomEvent) => {
          const nameInput = (await this.form).querySelector<SlInput>(
            "btrix-url-input",
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
          <btrix-url-input
            label=${msg("Site URL")}
            name="profile-url"
            placeholder=${msg("https://example.com")}
            value=${ifDefined(this.defaultUrl)}
            required
          >
          </btrix-url-input>

          <sl-input
            class="mt-4"
            label=${msg("Profile Name")}
            name="profile-name"
            placeholder=${msg("example.com")}
            value=${ifDefined(this.defaultUrl)}
            help-text=${msg("Defaults to site's domain name if omitted.")}
            maxlength="50"
          >
          </sl-input>

          ${when(
            showChannels || showProxies,
            () => html`
              <btrix-details class="mt-4" open>
                <span slot="title">${msg("Crawler Settings")}</span>

                ${showChannels
                  ? html`<div class="mt-4">
                      <btrix-select-crawler
                        .crawlerChannel=${this.crawlerChannel}
                        @on-change=${(e: SelectCrawlerChangeEvent) =>
                          (this.crawlerChannel = e.detail.value!)}
                      ></btrix-select-crawler>
                    </div>`
                  : nothing}
                ${showProxies
                  ? html`
                      <div class="mt-4">
                        <btrix-select-crawler-proxy
                          defaultProxyId=${ifDefined(
                            this.defaultProxyId || undefined,
                          )}
                          .proxyServers=${proxyServers}
                          .proxyId="${this.proxyId || ""}"
                          @btrix-change=${(e: SelectCrawlerProxyChangeEvent) =>
                            (this.proxyId = e.detail.value)}
                        ></btrix-select-crawler-proxy>
                      </div>
                    `
                  : nothing}
              </btrix-details>
            `,
          )}

          <input class="invisible block size-0" type="submit" />
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
            @click=${() => this.dialog?.submit()}
          >
            ${msg("Start Browser")}
          </sl-button>
        </div>
      </btrix-dialog>

      ${when(
        this.url,
        (url) =>
          html` <btrix-profile-browser-dialog
            .config=${{
              url,
              name: this.name || new URL(url).origin.slice(0, 50),
              crawlerChannel: this.crawlerChannel,
              proxyId: this.proxyId ?? undefined,
            }}
            ?open=${this.browserOpen}
            @btrix-updated=${() => {}}
            @sl-after-hide=${() => {}}
          >
          </btrix-profile-browser-dialog>`,
      )}
    `;
  }

  private async hideDialog() {
    void (await this.form).closest<Dialog>("btrix-dialog")?.hide();
  }

  private onReset() {
    void this.hideDialog();
  }

  private async onSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.target as HTMLFormElement;

    if (!form.checkValidity()) {
      return;
    }

    const formData = new FormData(form);
    this.name = formData.get("profile-name") as string;
    this.url = formData.get("profile-url") as string;

    await this.updateComplete;

    this.browserOpen = true;
  }
}
