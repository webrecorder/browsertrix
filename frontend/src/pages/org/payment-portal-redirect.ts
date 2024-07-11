import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import type { BillingPortal } from "@/types/billing";
import type { Auth, AuthState } from "@/utils/AuthService";

@localized()
@customElement("btrix-org-payment-portal-redirect")
export class OrgPaymentPortalRedirect extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  orgId?: string;

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);

  private readonly portalUrl = new Task(this, {
    task: async ([orgId, authState]) => {
      if (!orgId || !authState) throw new Error("Missing args");
      try {
        const { portalUrl } = await this.getPortalUrl(orgId, authState);

        if (portalUrl) {
          window.location.href = portalUrl;
        } else {
          throw new Error("Missing portalUrl");
        }
      } catch (e) {
        console.debug(e);

        throw new Error(
          msg("Sorry, couldn't retrieve current plan at this time."),
        );
      }
    },
    args: () => [this.orgId, this.authState] as const,
  });

  render() {
    return html`<div
      class="flex flex-1 flex-col items-center justify-center gap-4 pb-12"
    >
      ${this.portalUrl.render({
        pending: () => html`
          <sl-spinner class="text-2xl"></sl-spinner>
          <p class="text-neutral-500">
            ${msg("Redirecting to billing portal...")}
          </p>
        `,
        error: () => html`
          <sl-icon
            name="exclamation-triangle-fill"
            class="text-2xl text-danger-400"
          ></sl-icon>
          <p class="text-neutral-500">
            ${msg("Sorry, the billing portal is unavailable at this time.")}
          </p>
          <sl-button
            size="small"
            @click=${() => {
              if (window.opener) {
                window.opener.focus();
                window.close();
              } else {
                this.navigate.to(
                  `${this.navigate.orgBasePath}/settings/billing`,
                );
              }
            }}
            >${msg("Back to Org Settings")}</sl-button
          >
        `,
      })}
    </div>`;
  }

  private async getPortalUrl(orgId: string, auth: Auth) {
    return this.api.fetch<BillingPortal>(`/orgs/${orgId}/billing-portal`, auth);
  }
}
