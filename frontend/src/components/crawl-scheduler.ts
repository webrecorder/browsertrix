import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronstrue from "cronstrue"; // TODO localize

import LiteElement, { html } from "../utils/LiteElement";
import { getLocaleTimeZone } from "../utils/localization";
import type { CrawlTemplate } from "../pages/archive/types";

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-scheduler
 *   schedule="0 0 * * *"
 *   @submit=${this.handleSubmit}
 * ></btrix-crawl-templates-scheduler>
 * ```
 *
 * @event submit
 */
@localized()
export class CrawlTemplatesScheduler extends LiteElement {
  @property({ type: String })
  private schedule?: CrawlTemplate["schedule"];

  @state()
  private editedSchedule?: string;

  @state()
  private isScheduleDisabled?: boolean;

  private get timeZoneShortName() {
    return getLocaleTimeZone();
  }

  render() {
    // TODO consolidate with new
    const hours = Array.from({ length: 12 }).map((x, i) => ({
      value: i + 1,
      label: `${i + 1}`,
    }));
    const minutes = Array.from({ length: 60 }).map((x, i) => ({
      value: i,
      label: `${i}`.padStart(2, "0"),
    }));

    const getInitialScheduleInterval = (schedule: string) => {
      const [minute, hour, dayofMonth, month, dayOfWeek] = schedule.split(" ");
      if (dayofMonth === "*") {
        if (dayOfWeek === "*") {
          return "daily";
        }
        return "weekly";
      }
      return "monthly";
    };

    const nowHour = new Date().getHours();
    const initialHours = nowHour % 12 || 12;
    const initialPeriod = nowHour > 11 ? "PM" : "AM";
    const scheduleIntervalsMap = {
      daily: `0 ${nowHour} * * *`,
      weekly: `0 ${nowHour} * * ${new Date().getDay()}`,
      monthly: `0 ${nowHour} ${new Date().getDate()} * *`,
    };
    const initialInterval = this.schedule
      ? getInitialScheduleInterval(this.schedule)
      : "weekly";
    const nextSchedule =
      this.editedSchedule || scheduleIntervalsMap[initialInterval];

    return html`
      <sl-form @sl-submit=${this.onSubmit}>
        <div class="flex items-end">
          <div class="pr-2 flex-1">
            <sl-select
              name="scheduleInterval"
              label=${msg("Recurring crawls")}
              value=${initialInterval}
              hoist
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
              @sl-select=${(e: any) => {
                if (e.target.value) {
                  this.isScheduleDisabled = false;
                  this.editedSchedule = `${nextSchedule
                    .split(" ")
                    .slice(0, 2)
                    .join(" ")} ${(scheduleIntervalsMap as any)[e.target.value]
                    .split(" ")
                    .slice(2)
                    .join(" ")}`;
                } else {
                  this.isScheduleDisabled = true;
                }
              }}
            >
              <sl-menu-item value="">${msg("None")}</sl-menu-item>
              <sl-menu-item value="daily">${msg("Daily")}</sl-menu-item>
              <sl-menu-item value="weekly">${msg("Weekly")}</sl-menu-item>
              <sl-menu-item value="monthly">${msg("Monthly")}</sl-menu-item>
            </sl-select>
          </div>
        </div>
        <div class="grid grid-flow-col gap-2 items-center mt-2">
          <span class="px-1">${msg("At")}</span>
          <sl-select
            name="scheduleHour"
            class="w-24"
            value=${initialHours}
            ?disabled=${this.isScheduleDisabled}
            hoist
            @sl-hide=${this.stopProp}
            @sl-after-hide=${this.stopProp}
            @sl-select=${(e: any) => {
              const hour = +e.target.value;
              const period = e.target
                .closest("sl-form")
                .querySelector('sl-select[name="schedulePeriod"]').value;

              this.setScheduleHour({ hour, period, schedule: nextSchedule });
            }}
          >
            ${hours.map(
              ({ value, label }) =>
                html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
            )}
          </sl-select>
          <span>:</span>
          <sl-select
            name="scheduleMinute"
            class="w-24"
            value="0"
            ?disabled=${this.isScheduleDisabled}
            hoist
            @sl-hide=${this.stopProp}
            @sl-after-hide=${this.stopProp}
            @sl-select=${(e: any) =>
              (this.editedSchedule = `${e.target.value} ${nextSchedule
                .split(" ")
                .slice(1)
                .join(" ")}`)}
          >
            ${minutes.map(
              ({ value, label }) =>
                html`<sl-menu-item value=${value}>${label}</sl-menu-item>`
            )}
          </sl-select>
          <sl-select
            name="schedulePeriod"
            class="w-24"
            value=${initialPeriod}
            ?disabled=${this.isScheduleDisabled}
            hoist
            @sl-hide=${this.stopProp}
            @sl-after-hide=${this.stopProp}
            @sl-select=${(e: any) => {
              const hour = +e.target
                .closest("sl-form")
                .querySelector('sl-select[name="scheduleHour"]').value;
              const period = e.target.value;

              this.setScheduleHour({ hour, period, schedule: nextSchedule });
            }}
          >
            <sl-menu-item value="AM"
              >${msg("AM", { desc: "Time AM/PM" })}</sl-menu-item
            >
            <sl-menu-item value="PM"
              >${msg("PM", { desc: "Time AM/PM" })}</sl-menu-item
            >
          </sl-select>
          <span class="px-1">${this.timeZoneShortName}</span>
        </div>

        <div class="mt-5">
          ${this.isScheduleDisabled
            ? msg(html`<span class="font-medium"
                >Crawls will not repeat.</span
              >`)
            : msg(
                html`<span class="font-medium">New schedule will be:</span
                  ><br />
                  <span class="text-0-600"
                    >${cronstrue.toString(nextSchedule, {
                      verbose: true,
                    })}
                    (in ${this.timeZoneShortName} time zone)</span
                  >`
              )}
        </div>

        <div class="mt-5 text-right">
          <sl-button type="primary" submit
            >${msg("Save Crawl Schedule")}</sl-button
          >
        </div>
      </sl-form>
    `;
  }

  private onSubmit(event: any) {
    this.dispatchEvent(new CustomEvent("submit", event));
  }

  /**
   * Set correct local hour in schedule in 24-hr format
   **/
  private setScheduleHour({
    hour,
    period,
    schedule,
  }: {
    hour: number;
    period: "AM" | "PM";
    schedule: string;
  }) {
    // Convert 12-hr to 24-hr time
    let periodOffset = 0;

    if (hour === 12) {
      if (period === "AM") {
        periodOffset = -12;
      }
    } else if (period === "PM") {
      periodOffset = 12;
    }

    this.editedSchedule = `${schedule.split(" ")[0]} ${
      hour + periodOffset
    } ${schedule.split(" ").slice(2).join(" ")}`;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}

customElements.define(
  "btrix-crawl-templates-scheduler",
  CrawlTemplatesScheduler
);
