import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import type {
  SlButton,
  SlChangeEvent,
  SlCheckbox,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { UrlInput } from "@/components/ui/url-input";
import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";
import type { Profile } from "@/types/crawler";

type StartBrowserEventDetail = {
  url?: string;
  crawlerChannel?: Profile["crawlerChannel"];
};

export type BtrixStartBrowserEvent = CustomEvent<StartBrowserEventDetail>;

/**
 * Start browser with specified profile and additional configuration.
 *
 * @fires btrix-start-browser
 */
@customElement("btrix-start-browser-dialog")
@localized()
export class StartBrowserDialog extends BtrixElement {
  @consume({ context: orgProxiesContext, subscribe: true })
  private readonly orgProxies?: OrgProxiesContext;

  @consume({ context: orgCrawlerChannelsContext, subscribe: true })
  private readonly orgCrawlerChannels?: OrgCrawlerChannelsContext;

  @property({ type: Object })
  profile?: Profile;

  @property({ type: String })
  startUrl?: string;

  @property({ type: Boolean })
  open = false;

  @state()
  resetProfile = false;

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("form")
  private readonly form?: HTMLFormElement | null;

  @query("#submit-button")
  private readonly submitButton?: SlButton | null;

  render() {
    return html`<btrix-dialog
      .label=${msg("Configure Profile")}
      ?open=${this.open}
      @sl-initial-focus=${async () => {
        await this.updateComplete;

        if (this.startUrl) {
          this.submitButton?.focus();
        } else {
          this.dialog?.querySelector<UrlInput>("btrix-url-input")?.focus();
        }
      }}
      @sl-after-hide=${async () => {
        if (this.form) {
          this.form.reset();

          const input = this.form.querySelector<UrlInput>("btrix-url-input");
          if (input) {
            input.value = "";
            input.setCustomValidity("");
          }
        }

        void this.dialog?.hide();
      }}
    >
      <form
        @submit=${async (e: SubmitEvent) => {
          e.preventDefault();

          const form = e.target as HTMLFormElement;

          if (!form.checkValidity()) return;

          const values = serialize(form);
          const url = values["startingUrl"] as string;
          const crawlerChannel = values["crawlerChannel"] as string | undefined;

          this.dispatchEvent(
            new CustomEvent<StartBrowserEventDetail>("btrix-start-browser", {
              detail: { url, crawlerChannel },
            }),
          );
        }}
      >
        <btrix-url-input
          name="startingUrl"
          label=${this.startUrl ? msg("Load URL") : msg("New Site URL")}
          .value=${this.startUrl || ""}
          required
        ></btrix-url-input>

        ${when(
          this.orgCrawlerChannels &&
            this.orgCrawlerChannels.length > 1 &&
            this.profile,
          (profile) => html`
            <div class="mt-4">
              <btrix-select-crawler
                .crawlerChannel=${profile.crawlerChannel ||
                this.org?.crawlingDefaults?.crawlerChannel}
              >
              </btrix-select-crawler>
            </div>
          `,
        )}

        <sl-checkbox
          class="mt-4"
          @sl-change=${(e: SlChangeEvent) =>
            (this.resetProfile = (e.target as SlCheckbox).checked)}
        >
          ${msg("Reset configured sites")}
          ${when(
            this.resetProfile,
            () => html`
              <div slot="help-text">
                <sl-icon
                  class="mr-0.5 align-[-.175em]"
                  name="exclamation-triangle"
                ></sl-icon>
                ${msg(
                  "All previously configured site data and browsing activity will be removed.",
                )}
              </div>
            `,
          )}
        </sl-checkbox>

        ${when(this.resetProfile && this.profile, this.renderProxy)}
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button size="small" @click=${() => void this.dialog?.hide()}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          id="submit-button"
          variant="success"
          size="small"
          @click=${() => this.dialog?.submit()}
        >
          ${msg("Start Browser")}
        </sl-button>
      </div>
    </btrix-dialog>`;
  }

  private readonly renderProxy = (profile: Profile) => {
    if (!this.orgProxies?.servers.length) return;

    return html`
      <btrix-select-crawler-proxy
        defaultProxyId=${ifDefined(
          this.org?.crawlingDefaults?.profileid ||
            this.orgProxies.default_proxy_id ||
            undefined,
        )}
        .proxyServers=${this.orgProxies.servers}
        .proxyId=${profile.proxyId || ""}
      >
      </btrix-select-crawler-proxy>
    `;
  };
}
