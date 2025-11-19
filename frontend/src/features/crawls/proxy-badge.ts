import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";

@customElement("btrix-proxy-badge")
@localized()
export class ProxyBadge extends TailwindElement {
  @consume({ context: orgProxiesContext, subscribe: true })
  private readonly orgProxies?: OrgProxiesContext;

  @property({ type: String })
  proxyId?: string;

  render() {
    if (!this.proxyId || !this.orgProxies) return;

    const proxy = this.orgProxies.servers.find(({ id }) => id === this.proxyId);

    return html`<sl-tooltip
      content="${msg("Crawler Proxy Server")}${proxy
        ? `: ${proxy.description}`
        : ""}"
      hoist
    >
      <btrix-badge variant="blue" class="font-monostyle">
        <sl-icon name="globe2" class="mr-1.5"></sl-icon>
        ${proxy?.label || this.proxyId}
      </btrix-badge>
    </sl-tooltip>`;
  }
}
