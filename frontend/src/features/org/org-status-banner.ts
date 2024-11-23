import { localized, msg, str } from "@lit/localize";
import { differenceInDays } from "date-fns/fp";
import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { SubscriptionStatus } from "@/types/billing";
import { OrgReadOnlyReason } from "@/types/org";
import { formatISODateString } from "@/utils/localization";

type Alert = {
  test: () => boolean;
  content: () => {
    title: string | TemplateResult;
    detail: string | TemplateResult;
  };
};

@localized()
@customElement("btrix-org-status-banner")
export class OrgStatusBanner extends BtrixElement {
  render() {
    if (!this.org) return;

    const alert = this.alerts.find(({ test }) => test());

    if (!alert) return;

    const content = alert.content();

    return html`
      <div id="banner" class="border-b bg-slate-100 py-5">
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
          <sl-alert variant="danger" open>
            <sl-icon slot="icon" name="exclamation-triangle-fill"></sl-icon>
            <strong class="block font-semibold">${content.title}</strong>
            ${content.detail}
          </sl-alert>
        </div>
      </div>
    `;
  }

  /**
   * Alerts ordered by priority
   */
  private get alerts(): Alert[] {
    if (!this.org) return [];

    const billingTabLink = html`<a
      class="underline hover:no-underline"
      href=${`${this.navigate.orgBasePath}/settings/billing`}
      @click=${this.navigate.link}
      >${msg("billing settings")}</a
    >`;

    const {
      readOnly,
      readOnlyReason,
      readOnlyOnCancel,
      subscription,
      storageQuotaReached,
      execMinutesQuotaReached,
    } = this.org;

    const isTrial = subscription?.status === SubscriptionStatus.Trialing;

    const dateStr = formatISODateString(subscription!.futureCancelDate!, {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
    });

    return [
      {
        test: () =>
          !readOnly && !readOnlyOnCancel && !!subscription?.futureCancelDate,

        content: () => {
          const daysDiff = differenceInDays(
            new Date(),
            new Date(subscription!.futureCancelDate!),
          );
          return {
            title:
              daysDiff > 1
                ? msg(
                    str`Your org will be deleted in
              ${daysDiff} days`,
                  )
                : `Your org will be deleted within one day`,
            detail: html`
              <p>
                ${isTrial
                  ? msg(
                      str`Your free trial ends on ${dateStr}. When the trial ends, your user account, org, and all associated data will be deleted.`,
                    )
                  : msg(
                      str`Your subscription ends on ${dateStr}. Your user account, org, and all associated data will be deleted.`,
                    )}
              </p>
              <p>
                ${isTrial
                  ? msg(
                      html`Download any archived items you'd like to keep. To
                      choose a plan and continue using Browsertrix, see
                      ${billingTabLink}.`,
                    )
                  : msg(
                      html`We suggest downloading your archived items before
                      they are deleted. To keep your plan and data, see
                      ${billingTabLink}.`,
                    )}
              </p>
            `,
          };
        },
      },
      {
        test: () =>
          !readOnly && readOnlyOnCancel && !!subscription?.futureCancelDate,

        content: () => {
          const daysDiff = differenceInDays(
            new Date(),
            new Date(subscription!.futureCancelDate!),
          );
          return {
            title:
              daysDiff > 1
                ? msg(str`Archiving will be disabled in ${daysDiff} days`)
                : msg("Archiving will be disabled within one day"),
            detail: html`
              <p>
                ${isTrial
                  ? msg(
                      str`Your free trial ends on ${dateStr}. You will no longer be able to run crawls, upload files, create browser profiles, or create collections.`,
                    )
                  : msg(
                      str`Your subscription ends on ${dateStr}. You will no longer be able to run crawls, upload files, create browser profiles, or create collections.`,
                    )}
              </p>
              <p>
                ${msg(
                  isTrial
                    ? html`To choose a plan and keep using Browsertrix, see
                      ${billingTabLink}.`
                    : html`To choose a plan and continue using Browsertrix, see
                      ${billingTabLink}.`,
                )}
              </p>
            `,
          };
        },
      },
      {
        test: () =>
          !!readOnly && readOnlyReason === OrgReadOnlyReason.SubscriptionPaused,

        content: () => ({
          title: msg(str`Archiving is disabled for this org`),
          detail: msg(
            html`Your subscription has been paused due to payment failure.
            Please go to ${billingTabLink} to update your payment method.`,
          ),
        }),
      },
      {
        test: () =>
          !!readOnly &&
          readOnlyReason === OrgReadOnlyReason.SubscriptionCancelled,

        content: () => ({
          title: msg(str`Archiving is disabled for this org`),
          detail: msg(
            `Your subscription has been canceled. Please contact Browsertrix support to renew your plan.`,
          ),
        }),
      },
      {
        test: () => !!readOnly,

        content: () => ({
          title: msg(str`Archiving is disabled for this org`),
          detail: msg(`Please contact Browsertrix support to renew your plan.`),
        }),
      },
      {
        test: () => !readOnly && !!storageQuotaReached,
        content: () => ({
          title: msg(str`Your org has reached its storage limit`),
          detail: msg(
            str`To add archived items again, delete unneeded items and unused browser profiles to free up space, or contact ${this.appState.settings?.salesEmail || msg("Browsertrix host administrator")} to upgrade your storage plan.`,
          ),
        }),
      },
      {
        test: () => !readOnly && !!execMinutesQuotaReached,
        content: () => ({
          title: msg(
            str`Your org has reached its monthly execution minutes limit`,
          ),
          detail: msg(
            str`Contact ${this.appState.settings?.salesEmail || msg("Browsertrix host administrator")} to purchase additional monthly execution minutes or upgrade your plan.`,
          ),
        }),
      },
    ];
  }
}
