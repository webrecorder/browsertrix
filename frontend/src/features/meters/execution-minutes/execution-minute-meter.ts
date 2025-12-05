import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { executionMinuteColors } from "./colors";
import { renderBar, type RenderBarProps } from "./render-bar";
import { tooltipRow } from "./tooltip";

import { BtrixElement } from "@/classes/BtrixElement";
import { renderLegendColor } from "@/features/meters/utils/legend";
import { type Metrics } from "@/types/org";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

export type Bucket = "monthly" | "gifted" | "extra";

const EXEC_MINUTE_ORDER = [
  "monthly",
  "gifted",
  "extra",
] as const satisfies Bucket[];

@customElement("btrix-execution-minute-meter")
@localized()
export class ExecutionMinuteMeter extends BtrixElement {
  @property({ type: Object })
  metrics?: Metrics;

  render() {
    if (!this.metrics) return;
    return this.renderExecutionMinuteMeter2();
  }

  private readonly renderExecutionMinuteMeter2 = () => {
    if (!this.org) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}`;

    /** Usages in seconds */
    const usage = {
      monthly: this.org.monthlyExecSeconds?.[currentPeriod] ?? 0,
      extra: this.org.extraExecSeconds?.[currentPeriod] ?? 0,
      gifted: this.org.giftedExecSeconds?.[currentPeriod] ?? 0,
      total:
        (this.org.monthlyExecSeconds?.[currentPeriod] ?? 0) +
        (this.org.extraExecSeconds?.[currentPeriod] ?? 0) +
        (this.org.giftedExecSeconds?.[currentPeriod] ?? 0),
    };

    /** Quotas in seconds */
    const quotas = {
      monthly: this.org.quotas.maxExecMinutesPerMonth * 60,
      extra: this.org.extraExecSecondsAvailable + usage.extra,
      gifted: this.org.giftedExecSecondsAvailable + usage.gifted,
      total:
        this.org.quotas.maxExecMinutesPerMonth * 60 +
        this.org.extraExecSecondsAvailable +
        usage.extra +
        this.org.giftedExecSecondsAvailable +
        usage.gifted,
    };

    if (Math.abs(quotas.extra - this.org.quotas.extraExecMinutes * 60) > 0) {
      console.debug("WARN extra minutes doesn't match quotas", {
        quota: quotas.extra,
        usage: usage.extra,
        available: this.org.extraExecSecondsAvailable,
        expected: this.org.quotas.extraExecMinutes * 60,
      });
    }

    if (Math.abs(quotas.gifted - this.org.quotas.giftedExecMinutes * 60) > 0) {
      console.debug("WARN gifted minutes doesn't match quotas", {
        quota: quotas.gifted,
        usage: usage.gifted,
        available: this.org.giftedExecSecondsAvailable,
        expected: this.org.quotas.giftedExecMinutes * 60,
      });
    }

    /** Width values in reference to the total width of the value bar (usage.total) */
    const usedValues = {
      monthly: usage.total === 0 ? 0 : usage.monthly / usage.total,
      extra: usage.total === 0 ? 0 : usage.extra / usage.total,
      gifted: usage.total === 0 ? 0 : usage.gifted / usage.total,
    };

    /** Width values in reference to the total width of the meter (quotas.total) */
    const backgroundValues = {
      monthly: (quotas.monthly - usage.monthly) / quotas.total,
      extra: (quotas.extra - usage.extra) / quotas.total,
      gifted: (quotas.gifted - usage.gifted) / quotas.total,
      total: usage.total / quotas.total,
    };

    const hasQuota =
      this.org.quotas.maxExecMinutesPerMonth > 0 ||
      this.org.quotas.extraExecMinutes > 0 ||
      this.org.quotas.giftedExecMinutes > 0;
    const isReached = hasQuota && usage.total >= quotas.total;

    const foregroundTooltipContent = (currentBucket: Bucket) => {
      const rows = EXEC_MINUTE_ORDER.filter((bucket) => usedValues[bucket] > 0);
      if (rows.length < 2) return;
      return html`<hr class="my-2" />
        ${rows.map((bucket) =>
          tooltipRow(
            {
              monthly: msg("Monthly"),
              extra: msg("Extra"),
              gifted: msg("Gifted"),
            }[bucket],
            usage[bucket],
            bucket === currentBucket,
            executionMinuteColors[bucket].foreground,
          ),
        )}
        <hr class="my-2" />
        ${tooltipRow(msg("All used execution time"), usage.total)}`;
    };

    const backgroundTooltipContent = (currentBucket: Bucket) => {
      const rows = EXEC_MINUTE_ORDER.filter(
        (bucket) => backgroundValues[bucket] > 0,
      );
      if (rows.length < 2) return;
      return html`<hr class="my-2" />
        ${rows.map((bucket) =>
          tooltipRow(
            {
              monthly: msg("Monthly Remaining"),
              extra: msg("Extra Remaining"),
              gifted: msg("Gifted Remaining"),
            }[bucket],
            quotas[bucket] - usage[bucket],
            bucket === currentBucket,
            executionMinuteColors[bucket].background,
          ),
        )}
        <hr class="my-2" />
        ${tooltipRow(
          msg("All remaining execution time"),
          quotas.total - usage.total,
        )}`;
    };

    const foregroundBarConfig = (bucket: Bucket): RenderBarProps => ({
      value: usedValues[bucket],
      usedSeconds: Math.min(usage[bucket], quotas[bucket]),
      quotaSeconds: quotas[bucket],
      totalQuotaSeconds: quotas.total,
      title: html`${renderLegendColor(
        executionMinuteColors[bucket].foreground,
      )}${{
        monthly: msg("Used Monthly Execution Time"),
        extra: msg("Used Extra Execution Time"),
        gifted: msg("Used Gifted Execution Time"),
      }[bucket]}`,
      color: executionMinuteColors[bucket].foreground.primary,
      highlight: "used",
      content: foregroundTooltipContent(bucket),
    });

    const firstBackgroundBar =
      EXEC_MINUTE_ORDER.find((group) => backgroundValues[group] !== 0) ??
      "monthly";

    const backgroundBarConfig = (bucket: Bucket): RenderBarProps => ({
      value:
        backgroundValues[bucket] +
        // If the bucket is the first background bar, extend it to the width of the value bar
        // plus its own value, so that it extends under the value bar's rounded corners
        (bucket === firstBackgroundBar ? backgroundValues.total : 0),
      title: html`${renderLegendColor(
        executionMinuteColors[bucket].background,
      )}${{
        monthly: msg("Remaining Monthly Execution Time"),
        extra: msg("Remaining Extra Execution Time"),
        gifted: msg("Remaining Gifted Execution Time"),
      }[bucket]}`,
      highlight: "available",
      content: backgroundTooltipContent(bucket),
      usedSeconds: Math.max(usage[bucket], quotas[bucket]),
      quotaSeconds: quotas[bucket],
      availableSeconds: Math.max(0, quotas[bucket] - usage[bucket]),
      totalQuotaSeconds: Math.max(0, quotas.total - usage.total),
      color: executionMinuteColors[bucket].background.primary,
    });

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
                    ${humanizeExecutionSeconds(quotas.total - usage.total, {
                      style: "short",
                      round: "down",
                    })}
                    <span class="ml-1">${msg("remaining")}</span>
                  </span>
                `
              : "",
        )}
      </div>
      ${when(
        hasQuota && this.org,
        () => html`
          <div class="mb-2">
            <btrix-meter
              value=${usage.total}
              max=${quotas.total}
              valueText=${msg("time")}
              hasBackground
            >
              ${EXEC_MINUTE_ORDER.map((bucket) =>
                renderBar(foregroundBarConfig(bucket)),
              )}

              <div slot="background" class="contents">
                ${EXEC_MINUTE_ORDER.map((bucket) =>
                  renderBar(backgroundBarConfig(bucket)),
                )}
              </div>

              <span slot="valueLabel">
                ${humanizeExecutionSeconds(usage.total, {
                  style: "short",
                })}
              </span>
              <span slot="maxLabel">
                ${humanizeExecutionSeconds(quotas.total, {
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
