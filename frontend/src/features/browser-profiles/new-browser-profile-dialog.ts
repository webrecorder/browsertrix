import { consume } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
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
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type SelectCrawlerChangeEvent } from "@/components/ui/select-crawler";
import { type SelectCrawlerProxyChangeEvent } from "@/components/ui/select-crawler-proxy";
import { proxiesContext, type ProxiesContext } from "@/context/org";

@customElement("btrix-new-browser-profile-dialog")
@localized()
export class NewBrowserProfileDialog extends BtrixElement {
  @consume({ context: proxiesContext, subscribe: true })
  private readonly proxies?: ProxiesContext;

  @property({ type: Boolean })
  open = false;

  @property({ type: String })
  defaultProxyId?: string;

  @state()
  private isSubmitting = false;

  @state()
  private crawlerChannel = "default";

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
  }

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
        <btrix-url-input
          label=${msg("Starting URL")}
          name="url"
          placeholder=${msg("https://example.com")}
          autocomplete="off"
          required
        >
        </btrix-url-input>

        <div class="mt-4">
          <btrix-select-crawler
            .crawlerChannel=${this.crawlerChannel}
            @on-change=${(e: SelectCrawlerChangeEvent) =>
              (this.crawlerChannel = e.detail.value!)}
          ></btrix-select-crawler>
        </div>
        ${this.proxies?.servers.length
          ? html`
              <div class="mt-4">
                <btrix-select-crawler-proxy
                  defaultProxyId=${ifDefined(
                    this.proxies.default_proxy_id ?? undefined,
                  )}
                  .proxyServers=${this.proxies.servers}
                  .proxyId="${this.proxyId || ""}"
                  @btrix-change=${(e: SelectCrawlerProxyChangeEvent) =>
                    (this.proxyId = e.detail.value)}
                ></btrix-select-crawler-proxy>
              </div>
            `
          : nothing}

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
        proxyId: this.proxyId,
      });

      this.notify.toast({
        message: msg("Starting up browser for new profile..."),
        variant: "success",
        icon: "check2-circle",
        id: "browser-profile-update-status",
      });
      await this.hideDialog();
      this.navigate.to(
        `${this.navigate.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?${queryString.stringify({
          url,
          name: msg("My Profile"),
          crawlerChannel: this.crawlerChannel,
          proxyId: this.proxyId,
        })}`,
      );
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-update-status",
      });
    }
    this.isSubmitting = false;
  }

  private async createBrowser({
    url,
    crawlerChannel,
    proxyId,
  }: {
    url: string;
    crawlerChannel: string;
    proxyId: string | null;
  }) {
    const params = {
      url,
      crawlerChannel,
      proxyId,
    };

    return this.api.fetch<{ browserid: string }>(
      `/orgs/${this.orgId}/profiles/browser`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }
}
