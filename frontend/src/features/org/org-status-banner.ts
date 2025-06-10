import { localized, msg, str } from "@lit/localize";
import type { SlAlert } from "@shoelace-style/shoelace";
import { differenceInHours } from "date-fns/fp";
import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { SubscriptionStatus } from "@/types/billing";
import { OrgReadOnlyReason } from "@/types/org";

type Alert = {
  test: () => boolean;
  variant?: SlAlert["variant"];
  content: () => {
    title: string | TemplateResult;
    detail: string | TemplateResult;
  };
};

@customElement("btrix-org-status-banner")
@localized()
export class OrgStatusBanner extends BtrixElement {
  render() {
    if (!this.org) return;

    const alert = this.alerts.find(({ test }) => test());

    if (!alert) return;

    const content = alert.content();

    return html`
      <div id="banner" class="border-b bg-slate-100 py-5">
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
          <sl-alert variant=${alert.variant || "danger"} open>
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
      subscription,
      storageQuotaReached,
      execMinutesQuotaReached,
    } = this.org;
    const readOnlyOnCancel =
      subscription?.readOnlyOnCancel ?? this.org.readOnlyOnCancel;

    let hoursDiff = 0;
    let daysDiff = 0;
    let dateStr = "";
    const futureCancelDate = subscription?.futureCancelDate || null;

    if (futureCancelDate) {
      hoursDiff = differenceInHours(new Date(), new Date(futureCancelDate));
      daysDiff = Math.ceil(hoursDiff / 24);

      dateStr = this.localize.date(futureCancelDate, {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        timeZoneName: "short",
      });
    }

    const isCancelingTrial =
      subscription?.status == SubscriptionStatus.TrialingCanceled;
    const isTrial =
      subscription?.status === SubscriptionStatus.Trialing || isCancelingTrial;

    // show banner if < this many days of trial is left
    const MAX_TRIAL_DAYS_SHOW_BANNER = 8;

    return [
      {
        test: () =>
          !readOnly && !readOnlyOnCancel && !!futureCancelDate && !isTrial,

        content: () => {
          return {
            title:
              hoursDiff < 24
                ? msg("Your org will be deleted within one day")
                : daysDiff === 1
                  ? msg("Your org will be deleted in one day.")
                  : msg(str`Your org will be deleted in ${daysDiff} days`),
            detail: html`
              <p>
                ${msg(
                  str`Your subscription ends on ${dateStr}. Your user account, org, and all associated data will be deleted.`,
                )}
              </p>
              <p>
                ${msg(
                  html`We suggest downloading your archived items before they
                  are deleted. To keep your plan and data, see
                  ${billingTabLink}.`,
                )}
              </p>
            `,
          };
        },
      },
      {
        test: () =>
          !readOnly &&
          !readOnlyOnCancel &&
          !!futureCancelDate &&
          ((isTrial && daysDiff < MAX_TRIAL_DAYS_SHOW_BANNER) ||
            isCancelingTrial),
        variant: isCancelingTrial ? "danger" : "warning",
        content: () => {
          return {
            title:
              hoursDiff < 24
                ? msg("Your trial ends within one day")
                : daysDiff === 1
                  ? msg("You have one day left of your Browsertrix trial")
                  : msg(
                      str`You have ${daysDiff} days left of your Browsertrix trial`,
                    ),

            detail: html`<p>
                ${msg(str`Your free trial ends on ${dateStr}.`)}
                ${isCancelingTrial
                  ? msg(
                      html`To continue using Browsertrix, select
                        <strong>Subscribe Now</strong> in ${billingTabLink}.`,
                    )
                  : html`${msg(
                      "Afterwards, your subscription will continue automatically.",
                    )}
                    ${msg(
                      html`View and manage your subscription in
                      ${billingTabLink}.`,
                    )}`}
              </p>
              ${when(
                isCancelingTrial,
                () => html`
                  <p>
                    ${msg(
                      str`Your web archives are always yours — you can download any archived items you'd like to keep
                  before the trial ends!`,
                    )}
                  </p>
                `,
              )} `,
          };
        },
      },
      {
        test: () =>
          !readOnly && (readOnlyOnCancel ?? false) && !!futureCancelDate,

        content: () => {
          return {
            title:
              daysDiff > 1
                ? msg(str`Archiving will be disabled in ${daysDiff} days`)
                : msg("Archiving will be disabled within one day"),
            detail: html`
              <p>
                ${msg(
                  str`Your subscription ends on ${dateStr}. You will no longer be able to run crawls, upload files, create browser profiles, or create collections.`,
                )}
              </p>
              <p>
                ${msg(
                  html`To choose a plan and continue using Browsertrix, see
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
