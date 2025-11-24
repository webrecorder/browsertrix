import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { renderPercentage } from "@/strings/numbers";
import { type Metrics } from "@/types/org";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

@customElement("btrix-execution-minute-meter")
@localized()
export class ExecutionMinuteMeter extends BtrixElement {
  @property({ type: Object })
  metrics?: Metrics;

  render() {
    if (!this.metrics) return;
    return this.renderExecutionMinuteMeter(this.metrics);
  }

  private readonly renderExecutionMinuteMeter = (_metrics: Metrics) => {
    if (!this.org) return;

    let quotaSeconds = 0;

    if (this.org.quotas.maxExecMinutesPerMonth) {
      quotaSeconds = this.org.quotas.maxExecMinutesPerMonth * 60;
    }

    let quotaSecondsAllTypes = quotaSeconds;

    let quotaSecondsExtra = 0;
    if (this.org.extraExecSecondsAvailable) {
      quotaSecondsExtra = this.org.extraExecSecondsAvailable;
      quotaSecondsAllTypes += this.org.extraExecSecondsAvailable;
    }

    let quotaSecondsGifted = 0;
    if (this.org.giftedExecSecondsAvailable) {
      quotaSecondsGifted = this.org.giftedExecSecondsAvailable;
      quotaSecondsAllTypes += this.org.giftedExecSecondsAvailable;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}`;

    let usageSeconds = 0;
    if (this.org.monthlyExecSeconds) {
      const actualUsage = this.org.monthlyExecSeconds[currentPeriod];
      if (actualUsage) {
        usageSeconds = actualUsage;
      }
    }

    if (usageSeconds > quotaSeconds) {
      usageSeconds = quotaSeconds;
    }

    let usageSecondsAllTypes = 0;
    if (this.org.monthlyExecSeconds) {
      const actualUsage = this.org.monthlyExecSeconds[currentPeriod];
      if (actualUsage) {
        usageSecondsAllTypes = actualUsage;
      }
    }

    let usageSecondsExtra = 0;
    if (this.org.extraExecSeconds) {
      const actualUsageExtra = this.org.extraExecSeconds[currentPeriod];
      if (actualUsageExtra) {
        usageSecondsExtra = actualUsageExtra;
      }
    }
    const maxExecSecsExtra = this.org.quotas.extraExecMinutes * 60;
    // Cap usage at quota for display purposes
    if (usageSecondsExtra > maxExecSecsExtra) {
      usageSecondsExtra = maxExecSecsExtra;
    }
    if (usageSecondsExtra) {
      // Quota for extra = this month's usage + remaining available
      quotaSecondsAllTypes += usageSecondsExtra;
      quotaSecondsExtra += usageSecondsExtra;
    }

    let usageSecondsGifted = 0;
    if (this.org.giftedExecSeconds) {
      const actualUsageGifted = this.org.giftedExecSeconds[currentPeriod];
      if (actualUsageGifted) {
        usageSecondsGifted = actualUsageGifted;
      }
    }
    const maxExecSecsGifted = this.org.quotas.giftedExecMinutes * 60;
    // Cap usage at quota for display purposes
    if (usageSecondsGifted > maxExecSecsGifted) {
      usageSecondsGifted = maxExecSecsGifted;
    }
    if (usageSecondsGifted) {
      // Quota for gifted = this month's usage + remaining available
      quotaSecondsAllTypes += usageSecondsGifted;
      quotaSecondsGifted += usageSecondsGifted;
    }

    const hasQuota = Boolean(quotaSecondsAllTypes);
    const isReached = hasQuota && usageSecondsAllTypes >= quotaSecondsAllTypes;

    const maxTotalTime = quotaSeconds + quotaSecondsExtra + quotaSecondsGifted;
    if (isReached) {
      usageSecondsAllTypes = maxTotalTime;
      quotaSecondsAllTypes = maxTotalTime;
    }

    const hasExtra =
      usageSecondsExtra ||
      this.org.extraExecSecondsAvailable ||
      usageSecondsGifted ||
      this.org.giftedExecSecondsAvailable;

    const renderBar = (
      /** Time in Seconds */
      secondsUsed: number,
      secondsAvailable: number,
      label: string,
      color: string,
      divided = true,
    ) => {
      if (divided) {
        const used = humanizeExecutionSeconds(secondsUsed, { style: "short" });
        const available = humanizeExecutionSeconds(secondsAvailable, {
          style: "short",
        });
        return html` <btrix-divided-meter-bar
          value=${(secondsUsed / quotaSecondsAllTypes) * 100}
          quota=${(secondsAvailable / quotaSecondsAllTypes) * 100}
          style="--background-color:var(--sl-color-${color}-500); --quota-background-color:var(--sl-color-${color}-100)"
        >
          <header class="flex justify-between gap-4 font-medium leading-none">
            <span>${label}</span>
            <span
              >${humanizeExecutionSeconds(secondsUsed, {
                displaySeconds: true,
              })}</span
            >
          </header>
          <hr class="my-2" />
          <p>${msg(html`${used} used of ${available} available`)}</p>
        </btrix-divided-meter-bar>`;
      } else {
        return html`<btrix-meter-bar
          value=${100}
          style="--background-color:var(--sl-color-${color}-500);"
        >
          <header class="flex justify-between gap-4 font-medium leading-none">
            <span>${label}</span>
            <span
              >${humanizeExecutionSeconds(secondsUsed, {
                displaySeconds: true,
              })}</span
            >
          </header>
          <hr class="my-2" />
          <p>${renderPercentage(secondsUsed / secondsAvailable)}</p>
        </btrix-meter-bar>`;
      }
    };
    return html`
      <div class="mb-1 font-semibold">
        ${when(
          isReached,
          () => html`
            <div class="flex items-center gap-2">
              <sl-icon class="text-danger" name="x-octagon"></sl-icon>
              <span>${msg("Execution Minutes Quota Reached")}</span>
            </div>
          `,
          () =>
            hasQuota && this.org
              ? html`
                  <span class="inline-flex items-center">
                    ${humanizeExecutionSeconds(
                      quotaSeconds -
                        usageSeconds +
                        this.org.extraExecSecondsAvailable +
                        this.org.giftedExecSecondsAvailable,
                      { style: "short", round: "down" },
                    )}
                    <span class="ml-1">${msg("remaining")}</span>
                  </span>
                `
              : "",
        )}
      </div>
      ${when(
        hasQuota && this.org,
        (org) => html`
          <div class="mb-2">
            <btrix-meter
              value=${org.giftedExecSecondsAvailable ||
              org.extraExecSecondsAvailable ||
              isReached
                ? quotaSecondsAllTypes
                : usageSeconds}
              max=${quotaSecondsAllTypes}
              valueText=${msg("time")}
            >
              ${when(usageSeconds || quotaSeconds, () =>
                renderBar(
                  usageSeconds > quotaSeconds ? quotaSeconds : usageSeconds,
                  hasExtra ? quotaSeconds : quotaSecondsAllTypes,
                  msg("Monthly Execution Time"),
                  "lime",
                  hasExtra ? true : false,
                ),
              )}
              ${when(usageSecondsGifted || org.giftedExecSecondsAvailable, () =>
                renderBar(
                  usageSecondsGifted > quotaSecondsGifted
                    ? quotaSecondsGifted
                    : usageSecondsGifted,
                  quotaSecondsGifted,
                  msg("Gifted Execution Time"),
                  "blue",
                ),
              )}
              ${when(usageSecondsExtra || org.extraExecSecondsAvailable, () =>
                renderBar(
                  usageSecondsExtra > quotaSecondsExtra
                    ? quotaSecondsExtra
                    : usageSecondsExtra,
                  quotaSecondsExtra,
                  msg("Extra Execution Time"),
                  "violet",
                ),
              )}
              <div slot="available" class="flex-1">
                <btrix-popover placement="top" class="text-center">
                  <div slot="content">
                    <div>${msg("Monthly Execution Time Remaining")}</div>
                    <div class="text-xs opacity-80">
                      ${humanizeExecutionSeconds(quotaSeconds - usageSeconds, {
                        displaySeconds: true,
                      })}
                      |
                      ${renderPercentage(
                        (quotaSeconds - usageSeconds) / quotaSeconds,
                      )}
                    </div>
                  </div>
                  <div class="h-full w-full"></div>
                </btrix-popover>
              </div>
              <span slot="valueLabel">
                ${humanizeExecutionSeconds(usageSecondsAllTypes, {
                  style: "short",
                })}
              </span>
              <span slot="maxLabel">
                ${humanizeExecutionSeconds(quotaSecondsAllTypes, {
                  style: "short",
                })}
              </span>
            </btrix-meter>
          </div>
        `,
      )}
    `;
  };
}
