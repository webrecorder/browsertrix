import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BillingPortal } from "@/types/billing";
import type { AuthState } from "@/utils/AuthService";

@localized()
@customElement("btrix-org-payment-portal-redirect")
export class OrgPaymentPortalRedirect extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  protected updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("orgId") && this.orgId && this.authState) {
      void this.redirectToPortal();
    }
  }

  render() {
    return html`<div class="my-24 flex flex-col items-center gap-4">
      <sl-spinner class="text-2xl"></sl-spinner>
      <p class="text-neutral-500">${msg("Redirecting to billing portal...")}</p>
    </div>`;
  }

  private async redirectToPortal() {
    try {
      const { portalUrl } = await this.getPortalUrl();
      if (portalUrl) {
        console.log(portalUrl);
        window.location.href = portalUrl;
      }
    } catch (e) {
      console.debug(e);
    }
  }

  private async getPortalUrl(): Promise<BillingPortal> {
    // TODO replace with real data
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          portalUrl: "https://dev.browsertrix.com",
        });
      }, 500);
    });
  }
}
