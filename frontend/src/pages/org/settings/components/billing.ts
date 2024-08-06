import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { capitalize } from "lodash";

import { columns } from "../ui/columns";

import { BtrixElement } from "@/classes/BtrixElement";
import { SubscriptionStatus, type BillingPortal } from "@/types/billing";
import type { OrgData, OrgQuotas } from "@/types/org";
import { humanizeSeconds } from "@/utils/executionTimeFormatter";
import { formatNumber, getLocale } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const linkClassList = tw`transition-color text-primary hover:text-primary-500`;
const manageLinkClasslist = clsx(
  linkClassList,
  tw`flex items-center gap-2 p-2 text-sm font-semibold leading-none`,
);

@localized()
@customElement("btrix-org-settings-billing")
export class OrgSettingsBilling extends BtrixElement {
  static styles = css`
    .form-label {
      font-size: var(--sl-input-label-font-size-small);
    }
  `;

  @property({ type: String, noAccessor: true })
  salesEmail?: string;

  get portalUrlLabel() {
    const subscription = this.org?.subscription;

    if (!subscription) return;

    let label = msg("Manage Billing");

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

  private readonly portalUrl = new Task(this, {
    task: async ([appState]) => {
      if (!appState.settings?.billingEnabled || !appState.org?.subscription)
        return;

      try {
        const { portalUrl } = await this.getPortalUrl();

        if (portalUrl) {
          return portalUrl;
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
    args: () => [this.appState] as const,
  });

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
                    ${org.subscription?.futureCancelDate
                      ? html`
                          <div
                            class="mb-3 flex items-center gap-2 border-b pb-3 text-neutral-500"
                          >
                            <sl-icon
                              name="info-circle"
                              class="text-base"
                            ></sl-icon>
                            <span>
                              ${msg(
                                html`Your plan will be canceled on
                                  <sl-format-date
                                    lang=${getLocale()}
                                    class="truncate"
                                    date=${org.subscription.futureCancelDate}
                                    month="long"
                                    day="numeric"
                                    year="numeric"
                                  >
                                  </sl-format-date>`,
                              )}
                            </span>
                          </div>
                        `
                      : nothing}
                    <h5 class="mb-2 mt-4 text-xs leading-none text-neutral-500">
                      ${msg("Monthly quota")}
                    </h5>
                    ${this.renderQuotas(org.quotas)}
                  `,
                )}
              </div>
            `,
            html`
              <p class="mb-3 leading-normal">
                ${msg(
                  "Subscription status, features, and add-ons, if applicable.",
                )}
              </p>
              ${when(this.org, (org) =>
                org.subscription
                  ? html`<p class="mb-3 leading-normal">
                        ${msg(
                          str`You can view plan details, update payment methods, and update billing information by clicking “${this.portalUrlLabel}”.`,
                        )}
                      </p>
                      ${this.salesEmail
                        ? html`<p class="leading-normal">
                            ${msg(
                              html`To upgrade to Pro, contact us at
                                <a
                                  class=${linkClassList}
                                  href=${`mailto:${this.salesEmail}?subject=${msg(str`Upgrade Browsertrix plan (${this.userOrg?.name})`)}`}
                                  rel="noopener noreferrer nofollow"
                                  >${this.salesEmail}</a
                                >.`,
                            )}
                          </p>`
                        : nothing}`
                  : html`<p class="leading-normal">
                      ${this.salesEmail
                        ? msg(
                            str`Contact us at ${this.salesEmail} to make changes to your plan.`,
                          )
                        : msg(
                            str`Contact your Browsertrix host administrator to make changes to your plan.`,
                          )}
                    </p>`,
              )}
            `,
          ],
        ])}

        <div class="p-4">
          <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
            <h4>${msg("Usage History")}</h4>
          </btrix-section-heading>
          <btrix-usage-history-table
            .org=${this.org}
          ></btrix-usage-history-table>
        </div>
      </div>
    `;
  }

  private getPlanName(planId: string) {
    switch (planId) {
      case "starter":
        return msg("Starter");

      case "standard":
        return msg("Standard");

      case "plus":
        return msg("Plus");

      default:
        return capitalize(planId);
    }
  }

  private readonly renderSubscriptionDetails = (
    subscription: OrgData["subscription"],
  ) => {
    let tierLabel;
    let statusLabel;

    if (subscription) {
      tierLabel = html`
        <sl-icon class="text-neutral-500" name="nut"></sl-icon>
        ${this.getPlanName(subscription.planId)}
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
            <span class="text-danger">${msg("Paused, payment failed")}</span>
          `;
          break;
        }
        case SubscriptionStatus.Cancelled: {
          statusLabel = html`
            <span class="text-danger">${msg("Canceled")}</span>
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
          str`${quotas.maxExecMinutesPerMonth ? humanizeSeconds(quotas.maxExecMinutesPerMonth * 60, undefined, undefined, "long") : msg("Unlimited minutes")} of crawl and QA analysis execution time`,
        )}
      </li>
      <li>
        ${msg(
          html`${quotas.storageQuota
            ? html`<sl-format-bytes
                value=${quotas.storageQuota}
              ></sl-format-bytes>`
            : msg("Unlimited")}
          storage`,
        )}
      </li>
      <li>
        ${msg(
          str`${quotas.maxPagesPerCrawl ? formatNumber(quotas.maxPagesPerCrawl) : msg("Unlimited")} ${pluralOf("pages", quotas.maxPagesPerCrawl)} per crawl`,
        )}
      </li>
      <li>
        ${msg(
          str`${quotas.maxConcurrentCrawls ? formatNumber(quotas.maxConcurrentCrawls) : msg("Unlimited")} concurrent ${pluralOf("crawls", quotas.maxConcurrentCrawls)}`,
        )}
      </li>
    </ul>
  `;

  private renderPortalLink() {
    return html`
      <a
        class=${manageLinkClasslist}
        href=${ifDefined(this.portalUrl.value)}
        rel="noreferrer noopener"
        @click=${async (e: MouseEvent) => {
          e.preventDefault();

          // Navigate to freshest portal URL
          try {
            await this.portalUrl.run();

            if (this.portalUrl.value) {
              window.location.href = this.portalUrl.value;
            }
          } catch (e) {
            console.debug(e);
          }
        }}
      >
        ${this.portalUrlLabel}
        <sl-icon name="arrow-right"></sl-icon>
      </a>
    `;
  }

  private renderContactSalesLink(salesEmail: string) {
    return html`
      <a
        class=${manageLinkClasslist}
        href=${`mailto:${salesEmail}?subject=${msg(str`Pro plan change request (${this.userOrg?.name})`)}`}
        rel="noopener noreferrer nofollow"
      >
        <sl-icon name="envelope"></sl-icon>
        ${msg("Contact Sales")}
      </a>
    `;
  }

  private async getPortalUrl() {
    return this.api.fetch<BillingPortal>(`/orgs/${this.orgId}/billing-portal`);
  }
}
