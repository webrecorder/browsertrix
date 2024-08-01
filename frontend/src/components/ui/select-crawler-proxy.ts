import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import capitalize from "lodash/fp/capitalize";

import type { Proxy } from "@/pages/org/types";
import type { AuthState } from "@/utils/AuthService";
import LiteElement from "@/utils/LiteElement";

type SelectCrawlerProxyChangeDetail = {
  value: string | null;
};

export type SelectCrawlerProxyChangeEvent =
  CustomEvent<SelectCrawlerProxyChangeDetail>;

type SelectCrawlerProxyUpdateDetail = {
  show: boolean;
};

export type SelectCrawlerProxyUpdateEvent =
  CustomEvent<SelectCrawlerProxyUpdateDetail>;

type allProxiesAPIResponse = {
  servers: Proxy[];
};

/**
 * Crawler proxy select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler-proxy
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedcrawlerProxy = value}
 * ></btrix-select-crawler-proxy>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-crawler-proxy")
@localized()
export class SelectCrawlerProxy extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  proxyId: string | null = null;

  @state()
  private selectedProxy?: Proxy;

  @state()
  private allProxies?: Proxy[];

  protected firstUpdated() {
    void this.fetchallProxies();
  }
  // credit: https://dev.to/jorik/country-code-to-flag-emoji-a21
  private countryCodeToFlagEmoji(countryCode: String): String {
    return countryCode
      .toUpperCase()
      .split("")
      .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
      .join("");
  }

  render() {
    /*if (this.crawlerProxys && this.crawlerProxys.length < 2) {
      return html``;
    }*/

    return html`
      <sl-select
        name="crawlerProxy-select"
        label=${msg("Crawler Proxy Server")}
        value=${this.selectedProxy?.id || ""}
        placeholder=${msg("No Proxy")}
        hoist
        clearable
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          void this.fetchallProxies();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.allProxies?.map(
          (server) =>
            html` <sl-option value=${server.id}>
              ${server.country_code
                ? this.countryCodeToFlagEmoji(server.country_code)
                : ""}
              ${capitalize(server.label)}
            </sl-option>`,
        )}
        ${this.selectedProxy
          ? html`
              <div slot="help-text">
                ${msg("Description:")}
                <span class="font-monospace"
                  >${this.selectedProxy.description || ""}</span
                >
              </div>
            `
          : ``}
      </sl-select>
    `;
  }

  private onChange(e: Event) {
    this.stopProp(e);

    this.selectedProxy = this.allProxies?.find(
      ({ id }) => id === (e.target as SlSelect).value,
    );

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerProxyChangeDetail>("on-change", {
        detail: {
          value: this.selectedProxy ? this.selectedProxy.id : null,
        },
      }),
    );
  }

  /**
   * Fetch crawler proxies and update internal state
   */
  private async fetchallProxies(): Promise<void> {
    try {
      const servers = await this.getallProxies();
      this.allProxies = servers;

      if (this.proxyId && !this.selectedProxy?.id) {
        this.selectedProxy = this.allProxies.find(
          ({ id }) => id === this.proxyId,
        );
      }

      if (!this.selectedProxy) {
        this.proxyId = null;
        this.dispatchEvent(
          new CustomEvent("on-change", {
            detail: {
              value: null,
            },
          }),
        );
        this.selectedProxy = this.allProxies.find(
          ({ id }) => id === this.proxyId,
        );
      }

      this.dispatchEvent(
        new CustomEvent<SelectCrawlerProxyUpdateDetail>("on-update", {
          detail: {
            show: this.allProxies.length > 1,
          },
        }),
      );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve proxies at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getallProxies(): Promise<Proxy[]> {
    const data: allProxiesAPIResponse =
      await this.apiFetch<allProxiesAPIResponse>(
        `/orgs/${this.orgId}/crawlconfigs/crawler-proxies`,
        this.authState!,
      );

    return data.servers;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
