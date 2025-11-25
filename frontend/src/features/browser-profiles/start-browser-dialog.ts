import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlButton,
  SlChangeEvent,
  SlCheckbox,
  SlSelect,
} from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Details } from "@/components/ui/details";
import type { Dialog } from "@/components/ui/dialog";
import type { SelectCrawlerProxy } from "@/components/ui/select-crawler-proxy";
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
import type { WorkflowSearchValues } from "@/types/workflow";

type StartBrowserEventDetail = {
  url?: string;
  crawlerChannel?: Profile["crawlerChannel"];
  proxyId?: Profile["proxyId"];
  replaceBrowser: boolean;
};

export type BtrixStartBrowserEvent = CustomEvent<StartBrowserEventDetail>;

const PRIMARY_SITE_FIELD_NAME = "primarySite";
const URL_FORM_FIELD_NAME = "startingUrl";

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
  initialUrl?: string;

  @property({ type: Boolean })
  open = false;

  @state()
  loadUrl?: string;

  @state()
  replaceBrowser = false;

  @query("btrix-dialog")
  private readonly dialog?: Dialog | null;

  @query("form")
  private readonly form?: HTMLFormElement | null;

  @query("btrix-details")
  private readonly details?: Details | null;

  @query(`[name=${PRIMARY_SITE_FIELD_NAME}]`)
  private readonly primarySiteInput?: SlSelect | null;

  @query(`[name=${URL_FORM_FIELD_NAME}]`)
  private readonly urlInput?: UrlInput | null;

  @query("btrix-select-crawler-proxy")
  private readonly selectCrawlerProxy?: SelectCrawlerProxy | null;

  @query("#submit-button")
  private readonly submitButton?: SlButton | null;

  // Get unique origins from workflow first seeds/crawl start URLs
  private readonly workflowOrigins = new Task(this, {
    task: async ([profile], { signal }) => {
      if (!profile) return null;

      const query = queryString.stringify({ profileIds: profile.id });

      try {
        const { firstSeeds } = await this.api.fetch<WorkflowSearchValues>(
          `/orgs/${this.orgId}/crawlconfigs/search-values?${query}`,
          { signal },
        );

        const profileUrls = profile.origins.map((origin) => new URL(origin));
        const originMap: { [url: string]: boolean } = {};

        firstSeeds.forEach((seed) => {
          const seedUrl = new URL(seed);

          // Only check domain names without www
          if (
            profileUrls.some((url) => {
              return (
                seedUrl.hostname.replace(/^www\./, "") ===
                url.hostname.replace(/^www\./, "")
              );
            })
          ) {
            return;
          }

          originMap[seedUrl.origin] = true;
        });

        return Object.keys(originMap);
      } catch (e) {
        console.debug(e);
      }
    },
    args: () => [this.profile] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("initialUrl")) {
      this.loadUrl = this.initialUrl;
    }
  }

  protected firstUpdated(): void {
    if (this.loadUrl === undefined) {
      this.loadUrl = this.initialUrl;
    }
  }

  render() {
    const profile = this.profile;
    const channels = this.orgCrawlerChannels;
    const proxies = this.orgProxies;
    const proxyServers = proxies?.servers;
    const showChannels = channels && channels.length > 1 && profile;
    const showProxies =
      this.replaceBrowser && proxies && proxyServers?.length && profile;

    return html`<btrix-dialog
      .label=${msg("Load Profile")}
      ?open=${this.open}
      @sl-initial-focus=${async () => {
        await this.updateComplete;

        if (this.initialUrl) {
          this.submitButton?.focus();
        } else {
          this.dialog?.querySelector<UrlInput>("btrix-url-input")?.focus();
        }
      }}
      @sl-after-hide=${async () => {
        if (this.form) {
          this.form.reset();
        }

        this.replaceBrowser = false;
      }}
    >
      <form
        @reset=${() => {
          if (this.urlInput) {
            this.urlInput.value = "";
            this.urlInput.setCustomValidity("");
          }
        }}
        @submit=${async (e: SubmitEvent) => {
          e.preventDefault();

          const form = e.target as HTMLFormElement;

          if (!form.checkValidity()) return;

          const values = serialize(form);
          const url = values[URL_FORM_FIELD_NAME] as string;
          const crawlerChannel = values["crawlerChannel"] as string | undefined;
          const proxyId = this.selectCrawlerProxy?.value;

          this.dispatchEvent(
            new CustomEvent<StartBrowserEventDetail>("btrix-start-browser", {
              detail: {
                url,
                crawlerChannel,
                proxyId: this.replaceBrowser ? proxyId : undefined,
                replaceBrowser: this.replaceBrowser,
              },
            }),
          );
        }}
      >
        ${when(this.profile, this.renderUrl)}

        <sl-checkbox
          class="mt-4"
          @sl-change=${(e: SlChangeEvent) =>
            (this.replaceBrowser = (e.target as SlCheckbox).checked)}
        >
          ${msg("Reset previous configuration on save")}
          ${when(
            this.replaceBrowser,
            () => html`
              <div slot="help-text">
                <sl-icon
                  class="mr-0.5 align-[-.175em]"
                  name="exclamation-triangle"
                ></sl-icon>
                ${msg(
                  "Data, proxy settings, and browsing activity of all previously saved sites will be removed upon saving this browser profile session.",
                )}
              </div>
            `,
          )}
        </sl-checkbox>

        ${showProxies
          ? html`<div class="mt-4">
              <btrix-select-crawler-proxy
                .label=${msg("Proxy Server")}
                defaultProxyId=${ifDefined(
                  this.org?.crawlingDefaults?.profileid ||
                    proxies.default_proxy_id ||
                    undefined,
                )}
                .proxyServers=${proxyServers}
                .proxyId=${profile.proxyId || ""}
              >
              </btrix-select-crawler-proxy>
            </div>`
          : nothing}
        ${this.open && showChannels
          ? html`<btrix-details class="mt-4" ?open=${this.details?.open}>
              <span slot="title">${msg("Browser Session Settings")}</span>
              <div class="mt-4">
                <btrix-select-crawler
                  .crawlerChannel=${profile.crawlerChannel ||
                  this.org?.crawlingDefaults?.crawlerChannel}
                >
                </btrix-select-crawler>
              </div>
            </btrix-details>`
          : nothing}
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

  private readonly renderUrl = (profile: Profile) => {
    const option = (url: string) =>
      html`<sl-option
        class="part-[label]:overflow-hidden"
        value=${url}
        title=${url}
      >
        <div class="truncate">${url}</div>
      </sl-option>`;

    return html`<sl-select
        name=${PRIMARY_SITE_FIELD_NAME}
        label=${msg("Primary Site")}
        value=${this.initialUrl || ""}
        hoist
        @sl-change=${async (e: SlChangeEvent) => {
          this.loadUrl = (e.target as SlSelect).value as string;

          await this.updateComplete;

          if (this.open) {
            this.urlInput?.focus();
          }
        }}
      >
        <sl-option value="">${msg("New Site")}</sl-option>
        <sl-divider></sl-divider>
        <sl-menu-label>${msg("Saved Sites")}</sl-menu-label>
        ${profile.origins.map(option)}
        ${when(this.workflowOrigins.value, (seeds) =>
          seeds.length
            ? html`
                <sl-divider></sl-divider>
                <sl-menu-label
                  >${msg("Suggestions from Related Workflows")}</sl-menu-label
                >
                ${seeds.slice(0, 10).map(option)}
              `
            : nothing,
        )}
      </sl-select>

      <div class="mt-4">
        <btrix-url-input
          name=${URL_FORM_FIELD_NAME}
          label=${msg("URL to Load")}
          .value=${this.loadUrl || ""}
          required
          @sl-change=${(e: SlChangeEvent) => {
            const value = (e.target as UrlInput).value;
            let origin = "";

            try {
              origin = new URL(value).origin;
            } catch {
              // Not a valid URL
            }

            if (origin && this.primarySiteInput) {
              const savedSite = profile.origins.find(
                (url) => new URL(url).origin === origin,
              );

              this.primarySiteInput.value = savedSite || "";
            }
          }}
          help-text=${msg(
            "The first page of the site to load, like a login page.",
          )}
        >
        </btrix-url-input>
      </div> `;
  };
}
