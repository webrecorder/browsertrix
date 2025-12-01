import { localized, msg } from "@lit/localize";
import { html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { renderPercentage } from "@/strings/numbers";
import { type Metrics } from "@/types/org";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

const EXEC_MINUTE_ORDER = ["monthly", "gifted", "extra"] as const satisfies (
  | "monthly"
  | "gifted"
  | "extra"
)[];

@customElement("btrix-execution-minute-meter")
@localized()
export class ExecutionMinuteMeter extends BtrixElement {
  @property({ type: Object })
  metrics?: Metrics;

  render() {
    if (!this.metrics) return;
    return this.renderExecutionMinuteMeter2();
  }

  private readonly renderBar = ({
    value,
    usedSeconds,
    quotaSeconds,
    availableSeconds,
    totalQuotaSeconds = quotaSeconds,
    label,
    extraContent,
    color,
    highlight = "used",
  }: {
    value: number;
    usedSeconds: number;
    quotaSeconds: number;
    totalQuotaSeconds?: number;
    label: string;
    extraContent?: string | TemplateResult;
    color: string;
    highlight?: "used" | "available" | "totalAvailable";
    availableSeconds?: number;
  }) => {
    availableSeconds ??= quotaSeconds;
    const used = humanizeExecutionSeconds(usedSeconds, {
      displaySeconds: true,
    });
    const available = humanizeExecutionSeconds(availableSeconds, {
      displaySeconds: true,
    });
    const usedOrAvailable =
      highlight === "used" ? msg("used") : msg("available");
    const percentageOfUsed = renderPercentage(
      totalQuotaSeconds === 0 || value === 0
        ? 0
        : usedSeconds / totalQuotaSeconds,
    );
    return html`<btrix-meter-bar
      .value=${value * 100}
      style="--background-color:var(--sl-color-${color});"
      placement="top"
    >
      <header class="flex justify-between gap-4 font-medium leading-none">
        <span>${label}</span>
        <span
          >${humanizeExecutionSeconds(
            {
              used: usedSeconds,
              available: availableSeconds,
              totalAvailable: totalQuotaSeconds,
            }[highlight],
            {
              displaySeconds: true,
              round: highlight === "used" ? "up" : "down",
            },
          )}</span
        >
      </header>
      ${when(
        usedSeconds !== 0,
        () => html`
          <hr class="my-2" />
          ${extraContent}
          <p>${msg(html`${used} of ${available} ${usedOrAvailable}`)}</p>
          <p>
            ${msg(html`${percentageOfUsed} of all available execution time`)}
          </p>
        `,
      )}
    </btrix-meter-bar>`;
  };

  private readonly renderExecutionMinuteMeter2 = () => {
    if (!this.org) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}`;

    const quotas = {
      monthly: this.org.quotas.maxExecMinutesPerMonth * 60,
      extra: this.org.extraExecSecondsAvailable,
      gifted: this.org.giftedExecSecondsAvailable,
      total:
        this.org.quotas.maxExecMinutesPerMonth * 60 +
        this.org.extraExecSecondsAvailable +
        this.org.giftedExecSecondsAvailable,
    };

    const usage = {
      monthly: this.org.monthlyExecSeconds?.[currentPeriod] ?? 0,
      extra: this.org.extraExecSeconds?.[currentPeriod] ?? 0,
      gifted: this.org.giftedExecSeconds?.[currentPeriod] ?? 0,
      total:
        (this.org.monthlyExecSeconds?.[currentPeriod] ?? 0) +
        (this.org.extraExecSeconds?.[currentPeriod] ?? 0) +
        (this.org.giftedExecSeconds?.[currentPeriod] ?? 0),
    };

    const usedSections = {
      monthly: usage.total === 0 ? 0 : usage.monthly / usage.total,
      extra: usage.total === 0 ? 0 : usage.extra / usage.total,
      gifted: usage.total === 0 ? 0 : usage.gifted / usage.total,
    };
    const usedBackgroundSections = {
      monthly: usage.monthly / quotas.total,
      extra: usage.extra / quotas.total,
      gifted: usage.gifted / quotas.total,
      total: usage.total / quotas.total,
    };
    const backgroundSections = {
      monthly: (quotas.monthly - usage.monthly) / quotas.total,
      extra: (quotas.extra - usage.extra) / quotas.total,
      gifted: (quotas.gifted - usage.gifted) / quotas.total,
      total: (quotas.total - usage.total) / quotas.total,
    };

    const hasQuota = quotas.monthly > 0;
    const isReached = hasQuota && usage.total >= quotas.total;

    const tooltipRow = (title: string, value: number) => html`
      <p class="flex justify-between gap-4">
        <span>${title}</span>
        <span>${humanizeExecutionSeconds(value, { round: "down" })}</span>
      </p>
    `;

    const extraBackgroundTooltipContent = html`${EXEC_MINUTE_ORDER.filter(
      (bucket) => backgroundSections[bucket] > 0,
    ).map((bucket) =>
      tooltipRow(
        {
          monthly: msg("Monthly"),
          extra: msg("Extra"),
          gifted: msg("Gifted"),
        }[bucket],
        quotas[bucket] - usage[bucket],
      ),
    )}`;

    const backgroundTooltipConfig = (
      bucket: (typeof EXEC_MINUTE_ORDER)[number],
    ) =>
      ({
        label: msg("Available Execution Time"),
        highlight: "totalAvailable",
        extraContent: extraBackgroundTooltipContent,
        value: backgroundSections[bucket],
        usedSeconds: Math.max(usage[bucket], quotas[bucket]),
        quotaSeconds: quotas[bucket],
        availableSeconds: Math.max(0, quotas[bucket] - usage[bucket]),
        totalQuotaSeconds: Math.max(0, quotas.total - usage.total),
      }) as const;

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
              ${EXEC_MINUTE_ORDER.map(
                (group) =>
                  ({
                    monthly: this.renderBar({
                      value: usedSections.monthly,
                      usedSeconds: Math.min(usage.monthly, quotas.monthly),
                      quotaSeconds: quotas.monthly,
                      totalQuotaSeconds: quotas.total,
                      label: msg("Monthly Execution Time"),
                      color: "lime-500",
                      highlight: "used",
                    }),
                    gifted: when(usedSections.gifted, () =>
                      this.renderBar({
                        value: usedSections.gifted,
                        usedSeconds: Math.min(usage.gifted, quotas.gifted),
                        quotaSeconds: quotas.gifted,
                        totalQuotaSeconds: quotas.total,
                        label: msg("Gifted Execution Time"),
                        color: "blue-500",
                      }),
                    ),
                    extra: when(usedSections.extra, () =>
                      this.renderBar({
                        value: usedSections.extra,
                        usedSeconds: Math.min(usage.extra, quotas.extra),
                        quotaSeconds: quotas.extra,
                        totalQuotaSeconds: quotas.total,
                        label: msg("Extra Execution Time"),
                        color: "violet-500",
                      }),
                    ),
                  })[group],
              )}

              <div slot="background" class="contents">
                <!-- Used minutes -->
                ${{
                  monthly: this.renderBar({
                    value: usedBackgroundSections.total,
                    usedSeconds: Math.max(usage.monthly, quotas.monthly),
                    quotaSeconds: quotas.monthly,
                    availableSeconds: Math.max(
                      0,
                      quotas.monthly - usage.monthly,
                    ),
                    totalQuotaSeconds: quotas.total,
                    label: msg("Available Monthly Execution Time"),
                    color: "lime-100",
                    highlight: "available",
                  }),
                  extra: this.renderBar({
                    value: usedBackgroundSections.total,
                    usedSeconds: Math.max(usage.extra, quotas.extra),
                    quotaSeconds: quotas.extra,
                    availableSeconds: Math.max(0, quotas.extra - usage.extra),
                    totalQuotaSeconds: quotas.total,
                    label: msg("Available Extra Execution Time"),
                    color: "violet-100",
                    highlight: "available",
                  }),
                  gifted: this.renderBar({
                    value: usedBackgroundSections.total,
                    usedSeconds: Math.max(usage.gifted, quotas.gifted),
                    quotaSeconds: quotas.gifted,
                    availableSeconds: Math.max(0, quotas.gifted - usage.gifted),
                    totalQuotaSeconds: quotas.total,
                    label: msg("Available Gifted Execution Time"),
                    color: "blue-100",
                    highlight: "available",
                  }),
                }[
                  EXEC_MINUTE_ORDER.find(
                    (group) => backgroundSections[group] !== 0,
                  ) ?? "monthly"
                ]}
                ${EXEC_MINUTE_ORDER.map(
                  (group) =>
                    ({
                      monthly: this.renderBar({
                        ...backgroundTooltipConfig("monthly"),
                        color: "lime-100",
                      }),
                      extra: this.renderBar({
                        ...backgroundTooltipConfig("extra"),
                        color: "violet-100",
                      }),
                      gifted: this.renderBar({
                        ...backgroundTooltipConfig("gifted"),
                        color: "blue-100",
                      }),
                    })[group],
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
