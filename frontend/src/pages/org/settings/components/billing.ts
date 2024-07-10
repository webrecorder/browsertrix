import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { columns } from "../ui/columns";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Dialog } from "@/components/ui/dialog";
import { NavigateController } from "@/controllers/navigate";
import { SubscriptionStatus } from "@/types/billing";
import type { OrgData, OrgQuotas } from "@/types/org";
import type { AuthState } from "@/utils/AuthService";
import { humanizeSeconds } from "@/utils/executionTimeFormatter";
import { formatNumber } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const linkClassList = tw`transition-color text-primary hover:text-primary-500`;
const manageLinkClasslist = clsx(
  linkClassList,
  tw`flex items-center gap-2 p-2 text-sm font-semibold leading-none`,
);

/**
 * @fires btrix-update-org
 */
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

  @query("#portalLinkInfoDialog")
  private readonly portalLinkInfoDialog?: Dialog | null;

  private readonly navigate = new NavigateController(this);

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
                      ? html`${msg(
                          str`You can view plan details, update payment methods, and update billing information by clicking “${this.portalUrlLabel}”.`,
                        )}
                        ${this.salesEmail
                          ? msg(
                              html`To upgrade to Pro, contact us at
                                <a
                                  class=${linkClassList}
                                  href=${`mailto:${this.salesEmail}?subject=${msg(str`Upgrade Starter plan (${this.org?.name})`)}`}
                                  rel="noopener noreferrer nofollow"
                                  >${this.salesEmail}</a
                                >.`,
                            )
                          : nothing}`
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
      <a
        class=${manageLinkClasslist}
        href=${`${this.navigate.orgBasePath}/payment-portal-redirect`}
        target="btrixPaymentTab"
        @click=${(e: MouseEvent) => {
          e.preventDefault();
          const el = e.target as HTMLAnchorElement;
          const tabWindow = window.open(el.href, el.target);

          if (tabWindow) {
            const onVisibilityChange = () => {
              if (document.visibilityState === "hidden") {
                void this.portalLinkInfoDialog?.show();
                window.removeEventListener(
                  "visibilitychange",
                  onVisibilityChange,
                );
              }
            };
            window.addEventListener("visibilitychange", onVisibilityChange);

            tabWindow.focus();
            tabWindow.addEventListener("beforeunload", () => {
              void this.portalLinkInfoDialog?.hide();
            });
          }
        }}
      >
        ${this.portalUrlLabel}
        <sl-icon name="arrow-right"></sl-icon>
      </a>

      <btrix-dialog
        id="portalLinkInfoDialog"
        .label=${this.portalUrlLabel!}
        @sl-hide=${async () => {
          await this.updateComplete;
          this.dispatchEvent(
            new CustomEvent("btrix-update-org", {
              bubbles: true,
              composed: true,
            }),
          );
        }}
      >
        ${msg(
          "Check your open tabs for your billing portal. You can close the tab when you're done.",
        )}
        <sl-button
          size="small"
          slot="footer"
          @click=${async () => void this.portalLinkInfoDialog?.hide()}
          >${msg("Done")}</sl-button
        >
      </btrix-dialog>
    `;
  }

  private renderContactSalesLink(salesEmail: string) {
    return html`
      <a
        class=${manageLinkClasslist}
        href=${`mailto:${salesEmail}?subject=${msg(str`Pro plan change request (${this.org?.name})`)}`}
        rel="noopener noreferrer nofollow"
      >
        <sl-icon name="envelope"></sl-icon>
        ${msg("Contact Sales")}
      </a>
    `;
  }
}
