import { localized, msg } from "@lit/localize";
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
import type { UrlInput } from "@/components/ui/url-input";
import { SocialMediaPlatform } from "@/constants/social-media-platforms";
import {
  CrawlerChannelImage,
  type CrawlerChannel,
  type Proxy,
} from "@/types/crawler";

/**
 * @fires btrix-updated
 */
@customElement("btrix-new-browser-profile-dialog")
@localized()
export class NewBrowserProfileDialog extends BtrixElement {
  @property({ type: String })
  defaultUrl?: string;

  @property({ type: String })
  defaultName?: string;

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

  @property({ type: Boolean })
  navigateOnSave = false;

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

  @state()
  private socialMediaPlatform = false;

  @state()
  private showBestPractices = false;

  @query("btrix-url-input")
  private readonly urlInput?: UrlInput;

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

  show() {
    void this.dialog?.show();
  }

  hide() {
    void this.dialog?.hide();
  }

  render() {
    const channels = this.crawlerChannels;
    const proxyServers = this.proxyServers;
    const showChannels = channels && channels.length > 1;
    const showProxies = proxyServers?.length;
    const bestPracticesToggle = html`
      <button
        type="button"
        class="inline-flex items-center gap-1.5 font-medium"
        aria-expanded=${this.showBestPractices}
        aria-controls="profile-best-practices"
        @click=${() => (this.showBestPractices = !this.showBestPractices)}
      >
        ${this.showBestPractices
          ? html`${msg("Hide best practices")}
              <sl-icon name="chevron-up"></sl-icon>`
          : html` ${msg("Read best practices")}
              <sl-icon name="chevron-down"></sl-icon>`}
      </button>
    `;

    return html`
      <btrix-dialog
        class="[--width:36rem]"
        .label=${msg("New Browser Profile")}
        .open=${this.open}
        @sl-initial-focus=${async (e: CustomEvent) => {
          if (this.urlInput) {
            e.preventDefault();
            this.urlInput.focus();
          }
        }}
        @sl-hide=${() => (this.open = false)}
        @sl-after-hide=${async () => (await this.form).reset()}
      >
        <form
          id="browserProfileForm"
          @reset=${this.onReset}
          @submit=${this.onSubmit}
        >
          <btrix-url-input
            label=${msg("Primary Site URL")}
            name="profile-url"
            placeholder=${msg("https://example.com")}
            value=${ifDefined(this.defaultUrl)}
            help-text=${msg(
              "The first page of the site to load, like a login page.",
            )}
            required
            @sl-input=${this.checkPlatformOnInput}
            @paste=${this.checkPlatformOnInput}
          >
          </btrix-url-input>

          <div class="form-help-text">
            ${this.socialMediaPlatform
              ? html`<strong class="font-medium text-success"
                  >${msg(
                    "It looks like you’re visiting a social media site.",
                  )}</strong
                >`
              : msg("Logging into a public site?")}
            ${when(!this.showBestPractices, () => bestPracticesToggle)}
          </div>
          <div
            id="profile-best-practices"
            ?hidden=${!this.showBestPractices}
            class="form-help-text"
          >
            <p class="mb-2">
              ${msg(
                "Avoid using your personal accounts when logging into public websites.",
              )}
              ${msg(
                "While your username and password are never saved by Browsertrix, your finished web archive may still contain sensitive data like cookies and login tokens.",
              )}
            </p>
            <p class="mb-2">
              ${msg(
                "Always use an account dedicated to archiving unless your intention is to archive private content accessible only from designated accounts.",
              )}
            </p>

            ${bestPracticesToggle}
          </div>

          ${showProxies
            ? html`
                <div class="mt-4">
                  <btrix-select-crawler-proxy
                    .label=${msg("Proxy Server")}
                    defaultProxyId=${ifDefined(
                      this.defaultProxyId || undefined,
                    )}
                    .proxyServers=${proxyServers}
                    .proxyId="${this.proxyId || ""}"
                    @btrix-change=${(e: SelectCrawlerProxyChangeEvent) =>
                      (this.proxyId = e.detail.value)}
                  >
                    <div slot="help-text">
                      ${msg(
                        "When a proxy is selected, websites will see traffic as coming from the IP address of the proxy rather than where Browsertrix is deployed.",
                      )}
                    </div>
                  </btrix-select-crawler-proxy>
                </div>
              `
            : nothing}

          <sl-input
            class="mt-4"
            label=${msg("Profile Name")}
            name="profile-name"
            placeholder=${msg("example.com")}
            value=${ifDefined(
              this.defaultName ??
                (this.defaultUrl &&
                  new URL(this.defaultUrl).hostname.slice(0, 50)),
            )}
            help-text=${msg(
              "Defaults to the primary site's domain name if omitted.",
            )}
            maxlength="50"
          >
          </sl-input>

          ${showChannels
            ? html`<btrix-details class="mt-4">
                <span slot="title">${msg("Browser Session Settings")}</span>
                <div class="mt-4">
                  <btrix-select-crawler
                    .crawlerChannel=${this.crawlerChannel}
                    @on-change=${(e: SelectCrawlerChangeEvent) =>
                      (this.crawlerChannel = e.detail.value!)}
                  ></btrix-select-crawler></div
              ></btrix-details>`
            : nothing}

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
              name: this.name || new URL(url).hostname.slice(0, 50),
              crawlerChannel: this.crawlerChannel,
              proxyId: this.proxyId ?? undefined,
            }}
            ?open=${this.browserOpen}
            ?navigateOnSave=${this.navigateOnSave}
            @sl-hide=${async (e: Event) => {
              e.stopPropagation();
              this.browserOpen = false;
              this.open = false;
              this.hide();
            }}
          >
          </btrix-profile-browser-dialog>`,
      )}
    `;
  }

  private onReset() {
    this.urlInput?.setAttribute("value", this.defaultUrl ?? "");
    this.urlInput?.setCustomValidity("");

    if (this.dialog?.open) {
      this.hide();
    }
  }

  private readonly checkPlatformOnInput = (e: Event) => {
    const value = (e.target as UrlInput).value;

    this.socialMediaPlatform =
      value.length > 1 &&
      Object.values(SocialMediaPlatform).some((name) =>
        value.toLowerCase().includes(`${name}.`),
      );

    if (this.socialMediaPlatform && !this.showBestPractices) {
      this.showBestPractices = true;
    }
  };

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
