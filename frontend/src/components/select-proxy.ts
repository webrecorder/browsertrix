import { html } from "lit";
import { property, state } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement from "../utils/LiteElement";
import type { Proxy } from "../pages/org/types";
import type { APIPaginatedList } from "../types/api";

/**
 * Proxy select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-proxy
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedProxy = value}
 * ></btrix-select-proxy>
 * ```
 *
 * @event on-change
 */
@localized()
export class SelectProxy extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  proxyid?: string;

  @state()
  private selectedProxy?: Proxy;

  @state()
  private allProxies?: Proxy[];

  protected firstUpdated() {
    this.fetchAllProxies();
  }

  render() {
    return html`
      <sl-select
        name="proxyid"
        label=${msg("Select Crawling Proxy")}
        value=${this.selectedProxy?.id || ""}
        placeholder=${this.allProxies ? msg("No Proxy") : msg("Loading")}
        hoist
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          this.fetchAllProxies();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.allProxies
          ? html`
              <sl-option value="">${msg("No Proxy")}</sl-option>
              <sl-divider></sl-divider>
            `
          : html` <sl-spinner slot="prefix"></sl-spinner> `}
        ${this.allProxies?.map(
          (proxy) => html`
            <sl-option value=${proxy.id}> ${proxy.name} </sl-option>
          `
        )}
      </sl-select>

      ${this.allProxies && this.allProxies.length
        ? this.renderSelectedProxyInfo()
        : ""}
    `;
  }

  private renderSelectedProxyInfo() {
    if (!this.selectedProxy || !this.selectedProxy.description) return;

    return html`
      <div
        class="mt-2 border bg-neutral-50 rounded p-2 text-sm flex justify-between"
      >
        <em class="text-slate-500"> ${this.selectedProxy.description} </em>
      </div>
    `;
  }

  private onChange(e: any) {
    this.selectedProxy = this.allProxies?.find(
      ({ id }) => id === e.target.value
    );

    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          value: this.selectedProxy ? this.selectedProxy.id : null,
        },
      })
    );
  }

  /**
   * Fetch browser proxies and update internal state
   */
  private async fetchAllProxies(): Promise<void> {
    try {
      this.allProxies = await this.getProxies();

      if (this.proxyid && !this.selectedProxy) {
        this.selectedProxy = this.allProxies.find(
          ({ id }) => id === this.proxyid
        );
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve proxies at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProxies(): Promise<Proxy[]> {
    const data: Proxy[] = await this.apiFetch(
      `/orgs/${this.orgId}/proxies`,
      this.authState!
    );

    return data;
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
