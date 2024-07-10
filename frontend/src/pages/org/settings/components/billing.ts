import { localized, msg, str } from "@lit/localize";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { columns } from "../ui/columns";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { SubscriptionStatus, type BillingPortal } from "@/types/billing";
import type { OrgData, OrgQuotas } from "@/types/org";
import type { AuthState } from "@/utils/AuthService";
import { humanizeSeconds } from "@/utils/executionTimeFormatter";
import { formatNumber } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";

@localized()
@customElement("btrix-org-settings-billing")
export class OrgSettingsBilling extends TailwindElement {
  static styles = css`
    .form-label {
      font-size: var(--sl-input-label-font-size-small);
    }
  `;

  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object, noAccessor: true })
  org?: OrgData;

  @property({ type: String, noAccessor: true })
  salesEmail?: string;

  private readonly api = new APIController(this);

  get portalUrlLabel() {
    const subscription = this.org?.subscription;

    if (!subscription) return;

    let label = msg("Manage Plan");

    switch (subscription.status) {
      case SubscriptionStatus.PausedPaymentFailed: {
        label = msg("Update Billing");
        break;
      }
      case SubscriptionStatus.Cancelled: {
        label = msg("Choose Plan");
        break;
      }
      default:
        break;
    }

    return label;
  }

  render() {
    return html`
      <div class="rounded-lg border">
        ${columns([
          [
            html`
              <h4 class="form-label text-neutral-800">
                ${msg("Current Plan")}
              </h4>
              <div class="rounded border px-4 pb-4">
                ${when(
                  this.org,
                  (org) => html`
                    <div
                      class="mb-3 flex items-center justify-between border-b py-2"
                    >
                      <div
                        class="flex items-center gap-2 text-base font-semibold leading-none"
                      >
                        ${this.renderSubscriptionDetails(org.subscription)}
                      </div>
                      ${org.subscription
                        ? this.renderPortalLink()
                        : this.salesEmail
                          ? this.renderContactSalesLink(this.salesEmail)
                          : nothing}
                    </div>
                    ${this.renderQuotas(org.quotas)}
                  `,
                )}
              </div>
            `,
            html`
              <p class="mb-3">
                ${msg(
                  "Subscription status, features, and add-ons, if applicable.",
                )}
              </p>
              ${when(
                this.org,
                (org) => html`
                  <p class="leading-normal">
                    ${org.subscription
                      ? msg(
                          str`You can view plan details, update payment methods, and update billing information by clicking “${this.portalUrlLabel}”.`,
                        )
                      : this.salesEmail
                        ? msg(
                            str`Contact us at ${this.salesEmail} to make changes to your plan.`,
                          )
                        : msg(
                            str`Contact your Browsertrix host administrator to make changes to your plan.`,
                          )}
                  </p>
                `,
              )}
            `,
          ],
        ])}
      </div>
    `;
  }

  private readonly renderSubscriptionDetails = (
    subscription: OrgData["subscription"],
  ) => {
    let tierLabel;
    let statusLabel;

    if (subscription) {
      tierLabel = html`
        <sl-icon class="text-neutral-500" name="nut"></sl-icon>
        ${msg("Starter")}
      `;

      switch (subscription.status) {
        case SubscriptionStatus.Active: {
          statusLabel = html`
            <span class="text-success-700">${msg("Active")}</span>
          `;
          break;
        }
        case SubscriptionStatus.PausedPaymentFailed: {
          statusLabel = html`
            <span class="text-warning-600">
              ${msg("Paused due to failed payment")}
            </span>
          `;
          break;
        }
        case SubscriptionStatus.Cancelled: {
          statusLabel = html`
            <span class="text-danger-700">${msg("Canceled")}</span>
          `;
          break;
        }
        default:
          break;
      }
    } else {
      tierLabel = html`
        <sl-icon class="text-neutral-500" name="rocket-takeoff"></sl-icon>
        ${msg("Pro")}
      `;
    }

    return html`${tierLabel}${statusLabel
      ? html`<hr class="h-6 border-l" aria-orientation="vertical" />
          <span class="text-sm font-medium">${statusLabel}</span>`
      : nothing}`;
  };

  private readonly renderQuotas = (quotas: OrgQuotas) => html`
    <ul class="leading-relaxed text-neutral-700">
      <li>
        ${msg(
          str`${quotas.maxPagesPerCrawl ? formatNumber(quotas.maxPagesPerCrawl) : msg("Unlimited")} ${pluralOf("pages", quotas.maxPagesPerCrawl)} per crawl`,
        )}
      </li>
      <li>
        ${msg(
          html`${quotas.storageQuota
            ? html`<sl-format-bytes
                value=${quotas.storageQuota}
              ></sl-format-bytes>`
            : msg("Unlimited")}
          base disk space`,
        )}
      </li>
      <li>
        ${msg(
          str`${quotas.maxConcurrentCrawls ? formatNumber(quotas.maxConcurrentCrawls) : msg("Unlimited")} concurrent ${pluralOf("crawls", quotas.maxConcurrentCrawls)}`,
        )}
      </li>
      <li>
        ${msg(
          str`${quotas.maxExecMinutesPerMonth ? humanizeSeconds(quotas.maxExecMinutesPerMonth, undefined, undefined, "long") : msg("Unlimited minutes")} of base crawling time per month`,
        )}
      </li>
    </ul>
  `;

  private renderPortalLink() {
    return html`
      <sl-button
        variant="text"
        size="small"
        @click=${async () => {
          const { portalUrl } = await this.getPortalUrl();
          window
            .open(portalUrl, "btrixPaymentTab", "noopener=true,noreferrer=true")
            ?.focus();
        }}
      >
        ${this.portalUrlLabel}
        <sl-icon slot="suffix" name="arrow-right"></sl-icon>
      </sl-button>
    `;
  }

  private renderContactSalesLink(salesEmail: string) {
    return html`
      <sl-button
        variant="text"
        size="small"
        href=${`mailto:${salesEmail}`}
        rel="noopener noreferrer nofollow"
      >
        ${msg("Contact Sales")}
        <sl-icon slot="prefix" name="envelope"></sl-icon>
      </sl-button>
    `;
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
    // return this.api.fetch(`/orgs/${orgId}/billing`, auth);
  }
}
