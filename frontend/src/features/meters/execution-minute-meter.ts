import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type Metrics } from "@/types/org";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";

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
    label,
    color,
    highlight = "used",
  }: {
    value: number;
    usedSeconds: number;
    quotaSeconds: number;
    label: string;
    color: string;
    highlight?: "used" | "quota" | "available";
    availableSeconds?: number;
  }) => {
    availableSeconds ??= quotaSeconds;
    const used = humanizeExecutionSeconds(usedSeconds, {
      displaySeconds: true,
    });
    const available = humanizeExecutionSeconds(availableSeconds, {
      displaySeconds: true,
    });
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
              quota: quotaSeconds,
              available: availableSeconds,
            }[highlight],
            {
              displaySeconds: true,
            },
          )}</span
        >
      </header>
      <hr class="my-2" />
      <p>${msg(html`${used} used of ${available} available`)}</p>
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
      monthly: usage.monthly / usage.total,
      extra: usage.extra / usage.total,
      gifted: usage.gifted / usage.total,
    };
    const backgroundSections = {
      monthly: quotas.monthly / quotas.total,
      extra: quotas.extra / quotas.total,
      gifted: quotas.gifted / quotas.total,
    };

    const hasQuota = quotas.monthly > 0;
    const isReached = hasQuota && usage.total >= quotas.total;

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
              ${this.renderBar({
                value: usedSections.monthly,
                usedSeconds: Math.max(usage.monthly, quotas.monthly),
                quotaSeconds: quotas.monthly,
                label: msg("Monthly Execution Time"),
                color: "lime-500",
              })}
              ${this.renderBar({
                value: usedSections.gifted,
                usedSeconds: Math.max(usage.gifted, quotas.gifted),
                quotaSeconds: quotas.gifted,
                label: msg("Gifted Execution Time"),
                color: "blue-500",
              })}
              ${this.renderBar({
                value: usedSections.extra,
                usedSeconds: Math.max(usage.extra, quotas.extra),
                quotaSeconds: quotas.extra,
                label: msg("Extra Execution Time"),
                color: "violet-500",
              })}

              <div slot="background" class="contents">
                ${this.renderBar({
                  value: backgroundSections.monthly,
                  usedSeconds: Math.max(usage.monthly, quotas.monthly),
                  quotaSeconds: quotas.monthly,
                  availableSeconds: Math.max(0, quotas.monthly - usage.monthly),
                  label: msg("Available Monthly Execution Time"),
                  color: "lime-100",
                  highlight: "available",
                })}
                ${this.renderBar({
                  value: backgroundSections.gifted,
                  usedSeconds: Math.max(usage.gifted, quotas.gifted),
                  quotaSeconds: quotas.gifted,
                  availableSeconds: Math.max(0, quotas.gifted - usage.gifted),
                  label: msg("Available Gifted Execution Time"),
                  color: "blue-100",
                  highlight: "available",
                })}
                ${this.renderBar({
                  value: backgroundSections.extra,
                  usedSeconds: Math.max(usage.extra, quotas.extra),
                  quotaSeconds: quotas.extra,
                  availableSeconds: Math.max(0, quotas.extra - usage.extra),
                  label: msg("Available Extra Execution Time"),
                  color: "violet-100",
                  highlight: "available",
                })}
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
