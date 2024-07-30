import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import capitalize from "lodash/fp/capitalize";

import type { crawlerSSHProxy } from "@/pages/org/types";
import type { AuthState } from "@/utils/AuthService";
import LiteElement from "@/utils/LiteElement";

type SelectCrawlerSSHProxyChangeDetail = {
  value: string | null;
};

export type SelectCrawlerSSHProxyChangeEvent =
  CustomEvent<SelectCrawlerSSHProxyChangeDetail>;

type SelectCrawlerSSHProxyUpdateDetail = {
  show: boolean;
};

export type SelectCrawlerSSHProxyUpdateEvent =
  CustomEvent<SelectCrawlerSSHProxyUpdateDetail>;

type crawlerSSHProxiesAPIResponse = {
  servers: crawlerSSHProxy[];
};

/**
 * Crawler ssh proxy select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler-ssh-proxy
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedcrawlerSSHProxy = value}
 * ></btrix-select-crawler-ssh-proxy>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-crawler-ssh-proxy")
@localized()
export class SelectCrawlerSSHProxy extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlerSSHProxyId: string | null = null;

  @state()
  private selectedSSHProxy?: crawlerSSHProxy;

  @state()
  private crawlerSSHProxies?: crawlerSSHProxy[];

  protected firstUpdated() {
    void this.fetchCrawlerSSHProxies();
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
    /*if (this.crawlerSSHProxys && this.crawlerSSHProxys.length < 2) {
      return html``;
    }*/

    return html`
      <sl-select
        name="crawlerSSHProxy-select"
        label=${msg("Crawler Proxy Server")}
        value=${this.selectedSSHProxy?.id || ""}
        placeholder=${msg("No Proxy")}
        hoist
        clearable
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          void this.fetchCrawlerSSHProxies();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.crawlerSSHProxies?.map(
          (server) =>
            html` <sl-option value=${server.id}>
              ${this.countryCodeToFlagEmoji(server.country_code)}
              ${capitalize(server.id)}
            </sl-option>`,
        )}
        ${this.selectedSSHProxy
          ? html`
              <div slot="help-text">
                ${msg("Connection:")}
                <span class="font-monospace"
                  >${this.selectedSSHProxy.username}@${this.selectedSSHProxy
                    .hostname}</span
                >
              </div>
            `
          : ``}
      </sl-select>
    `;
  }

  private onChange(e: Event) {
    this.stopProp(e);

    this.selectedSSHProxy = this.crawlerSSHProxies?.find(
      ({ id }) => id === (e.target as SlSelect).value,
    );

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerSSHProxyChangeDetail>("on-change", {
        detail: {
          value: this.selectedSSHProxy ? this.selectedSSHProxy.id : null,
        },
      }),
    );
  }

  /**
   * Fetch crawler ssh proxies and update internal state
   */
  private async fetchCrawlerSSHProxies(): Promise<void> {
    try {
      const servers = await this.getCrawlerSSHProxies();
      this.crawlerSSHProxies = servers;

      if (this.crawlerSSHProxyId && !this.selectedSSHProxy?.id) {
        this.selectedSSHProxy = this.crawlerSSHProxies.find(
          ({ id }) => id === this.crawlerSSHProxyId,
        );
      }

      if (!this.selectedSSHProxy) {
        this.crawlerSSHProxyId = null;
        this.dispatchEvent(
          new CustomEvent("on-change", {
            detail: {
              value: null,
            },
          }),
        );
        this.selectedSSHProxy = this.crawlerSSHProxies.find(
          ({ id }) => id === this.crawlerSSHProxyId,
        );
      }

      this.dispatchEvent(
        new CustomEvent<SelectCrawlerSSHProxyUpdateDetail>("on-update", {
          detail: {
            show: this.crawlerSSHProxies.length > 1,
          },
        }),
      );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve ssh proxies at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlerSSHProxies(): Promise<crawlerSSHProxy[]> {
    const data: crawlerSSHProxiesAPIResponse =
      await this.apiFetch<crawlerSSHProxiesAPIResponse>(
        `/orgs/${this.orgId}/crawlconfigs/crawler-ssh-proxies`,
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
