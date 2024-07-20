import { localized, msg, str } from "@lit/localize";
import { differenceInDays } from "date-fns/fp";
import { html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { NavigateController } from "@/controllers/navigate";
import { OrgReadOnlyReason, type OrgData } from "@/types/org";
import { formatISODateString } from "@/utils/localization";
import appState, { use } from "@/utils/state";

type Alert = {
  test: () => boolean;
  persist?: boolean;
  content: () => {
    title: string | TemplateResult;
    detail: string | TemplateResult;
  };
};

@localized()
@customElement("btrix-org-status-banner")
export class OrgStatusBanner extends TailwindElement {
  @property({ type: Object })
  org?: OrgData;

  @use()
  appState = appState;

  @state()
  isAlertOpen = false;

  private readonly navigate = new NavigateController(this);

  private alert?: Alert;

  protected willUpdate(_changedProperties: PropertyValues): void {
    if (_changedProperties.has("org") && this.org) {
      this.alert = this.alerts.find(({ test }) => test());

      if (this.alert) {
        this.isAlertOpen = true;
      }
    }
  }

  render() {
    if (!this.org) return;

    return html`
      <div
        class="${this.isAlertOpen
          ? "bg-slate-100 border-b py-5"
          : ""} transition-all"
      >
        <div class="mx-auto box-border w-full max-w-screen-desktop px-3">
          <sl-alert
            variant="danger"
            ?closable=${!this.alert?.persist}
            ?open=${this.isAlertOpen}
            @sl-after-hide=${() => (this.isAlertOpen = false)}
          >
            <sl-icon slot="icon" name="exclamation-triangle-fill"></sl-icon>
            ${this.renderContent()}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderContent() {
    if (!this.alert || !this.org) return;

    const content = this.alert.content();

    return html`
      <strong class="block font-semibold">${content.title}</strong>
      ${content.detail}
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

    return [
      {
        test: () =>
          !readOnly && !readOnlyOnCancel && !!subscription?.futureCancelDate,
        persist: true,
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
                ${msg(
                  str`Your subscription ends on ${formatISODateString(
                    subscription!.futureCancelDate!,
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                    },
                  )}. Your user account, org, and all associated data will be deleted.`,
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
          !readOnly && readOnlyOnCancel && !!subscription?.futureCancelDate,
        persist: true,
        content: () => {
          const daysDiff = differenceInDays(
            new Date(),
            new Date(subscription!.futureCancelDate!),
          );
          return {
            title:
              daysDiff > 1
                ? msg(
                    str`Your org will be set to read-only mode in ${daysDiff} days`,
                  )
                : msg("Your org will be set to read-only mode within one day"),
            detail: html`
              <p>
                ${msg(
                  str`Your subscription ends on ${formatISODateString(
                    subscription!.futureCancelDate!,
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                    },
                  )}. You will no longer be able to run crawls, upload files, create browser profiles, or create collections.`,
                )}
              </p>
              <p>
                ${msg(
                  html`To keep your plan and continue crawling, see
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
        persist: true,
        content: () => ({
          title: msg(str`Your org has been set to read-only mode`),
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
        persist: true,
        content: () => ({
          title: msg(str`This org has been set to read-only mode`),
          detail: msg(
            `Your subscription has been canceled. Please contact Browsertrix support to renew your plan.`,
          ),
        }),
      },
      {
        test: () => !!readOnly,
        persist: true,
        content: () => ({
          title: msg(str`This org has been set to read-only mode`),
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
