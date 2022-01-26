import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronstrue from "cronstrue"; // TODO localize

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { getLocaleTimeZone } from "../../utils/localization";
import type { CrawlTemplate } from "./types";
import { getUTCSchedule } from "./utils";

const SEED_URLS_MAX = 3;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-detail></btrix-crawl-templates-detail>
 * ```
 */
@localized()
export class CrawlTemplatesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  crawlConfigId!: string;

  @property({ type: Boolean })
  isEditing: boolean = false;

  @state()
  private crawlTemplate?: CrawlTemplate;

  @state()
  private showAllSeedURLs: boolean = false;

  @state()
  private editedSchedule?: string;

  @state()
  private isScheduleDisabled?: boolean;

  private get timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private get timeZoneShortName() {
    return getLocaleTimeZone();
  }

  async firstUpdated() {
    try {
      this.crawlTemplate = await this.getCrawlTemplate();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.crawlTemplate) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <h2 class="text-xl font-bold mb-4">${this.crawlTemplate.name}</h2>

      ${this.crawlTemplate.currCrawlId
        ? html`
            <a
              class="flex items-center justify-between mb-4 px-3 py-2 border rounded-lg bg-purple-50 border-purple-200 hover:border-purple-500 shadow shadow-purple-200 text-purple-800 transition-colors"
              href=${`/archives/${this.archiveId}/crawls/${this.crawlTemplate.currCrawlId}`}
              @click=${this.navLink}
            >
              <span>${msg("View currently running crawl")}</span>
              <sl-icon name="arrow-right"></sl-icon>
            </a>
          `
        : ""}

      <section class="px-4 py-3 border-t border-b mb-4 text-sm">
        <dl class="grid grid-cols-2">
          <div>
            <dt class="text-xs text-0-600">${msg("Created by")}</dt>
            <!-- TODO show name -->
            <dd>${this.crawlTemplate.user}</dd>
          </div>
        </dl>

        <!-- TODO created at? -->
      </section>

      <main class="border rounded-lg">
        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Configuration")}</h3>
          </div>
          <div class="col-span-3 p-4 md:p-8 border-b">
            <div class="mb-5" role="table">
              <div class="grid grid-cols-5 gap-4" role="row">
                <span class="col-span-3 text-sm text-0-600" role="columnheader"
                  >${msg("Seed URL")}</span
                >
                <span class="col-span-1 text-sm text-0-600" role="columnheader"
                  >${msg("Scope Type")}</span
                >
                <span class="col-span-1 text-sm text-0-600" role="columnheader"
                  >${msg("Page Limit")}</span
                >
              </div>
              <ul role="rowgroup">
                ${this.crawlTemplate.config.seeds
                  .slice(0, this.showAllSeedURLs ? undefined : SEED_URLS_MAX)
                  .map(
                    (seed, i) =>
                      html`<li
                        class="grid grid-cols-5 gap-4 items-baseline py-1 border-zinc-100${i
                          ? " border-t"
                          : ""}"
                        role="row"
                        title=${typeof seed === "string" ? seed : seed.url}
                      >
                        <div
                          class="col-span-3 break-all leading-tight"
                          role="cell"
                        >
                          ${typeof seed === "string" ? seed : seed.url}
                        </div>
                        <span
                          class="col-span-1 uppercase text-0-500 text-xs"
                          role="cell"
                          >${(typeof seed !== "string" && seed.scopeType) ||
                          this.crawlTemplate?.config.scopeType}</span
                        >
                        <span
                          class="col-span-1 uppercase text-0-500 text-xs font-mono"
                          role="cell"
                          >${(typeof seed !== "string" && seed.limit) ||
                          this.crawlTemplate?.config.limit}</span
                        >
                      </li>`
                  )}
              </ul>

              ${this.crawlTemplate.config.seeds.length > SEED_URLS_MAX
                ? html`<sl-button
                    class="mt-2"
                    type="neutral"
                    size="small"
                    @click=${() =>
                      (this.showAllSeedURLs = !this.showAllSeedURLs)}
                  >
                    <span class="text-sm">
                      ${this.showAllSeedURLs
                        ? msg("Show less")
                        : msg(str`Show
                    ${this.crawlTemplate.config.seeds.length - SEED_URLS_MAX}
                    more`)}
                    </span>
                  </sl-button>`
                : ""}
            </div>

            <sl-details style="--sl-spacing-medium: var(--sl-spacing-small)">
              <span slot="summary" class="text-sm">
                <span class="font-medium"
                  >${msg("Advanced configuration")}</span
                >
                <sl-tag size="small" type="neutral"
                  >${msg("JSON")}</sl-tag
                ></span
              >
              <div class="relative">
                <pre
                  class="language-json bg-gray-800 text-gray-50 p-4 rounded font-mono text-xs"
                ><code>${JSON.stringify(
                  this.crawlTemplate.config,
                  null,
                  2
                )}</code></pre>

                <div class="absolute top-2 right-2">
                  <btrix-copy-button
                    .value="${JSON.stringify(
                      this.crawlTemplate.config,
                      null,
                      2
                    )}"
                  ></btrix-copy-button>
                </div>
              </div>
            </sl-details>
          </div>
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8 md:border-b">
            <h3 class="font-medium">${msg("Schedule")}</h3>
          </div>
          <div class="col-span-3 p-4 border-b">
            <div class="flex justify-between">
              <div class="md:p-4">
                ${this.isEditing
                  ? this.renderEditSchedule()
                  : this.renderReadOnlySchedule()}
              </div>

              <div class="ml-2">
                <sl-button
                  size="small"
                  href=${`/archives/${this.archiveId}/crawl-templates/${
                    this.crawlTemplate!.id
                  }${this.isEditing ? "" : "?edit=true"}`}
                  @click=${(e: any) => {
                    this.navLink(e);
                    this.editedSchedule = "";
                  }}
                >
                  ${this.isEditing ? msg("Cancel") : msg("Edit")}
                </sl-button>
              </div>
            </div>
          </div>
        </section>

        <section class="md:grid grid-cols-4">
          <div class="col-span-1 p-4 md:p-8">
            <h3 class="font-medium">${msg("Crawls")}</h3>
          </div>
          <div class="col-span-3 p-4 md:p-8">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("# of Crawls")}</dt>
                <dd class="font-mono">
                  ${(this.crawlTemplate.crawlCount || 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">
                  ${msg("Currently Running Crawl")}
                </dt>
                <dd
                  class="flex items-center justify-between border border-zinc-100 rounded p-1 mt-1"
                >
                  ${this.crawlTemplate.currCrawlId
                    ? html` <a
                        class="text-primary font-medium hover:underline text-sm p-1"
                        href=${`/archives/${this.archiveId}/crawls/${this.crawlTemplate.currCrawlId}`}
                        @click=${this.navLink}
                        >${msg("View crawl")}</a
                      >`
                    : html`<span class="text-0-400 text-sm p-1"
                          >${msg("None")}</span
                        ><button
                          class="text-xs border rounded px-2 h-7 bg-purple-500 hover:bg-purple-400 text-white transition-colors"
                          @click=${() => this.runNow()}
                        >
                          <span class="whitespace-nowrap">
                            ${msg("Run now")}
                          </span>
                        </button>`}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Latest Crawl")}</dt>
                <dd
                  class="flex items-center justify-between border border-zinc-100 rounded p-1 mt-1"
                >
                  ${this.crawlTemplate.lastCrawlId
                    ? html`<a
                          class="text-primary font-medium hover:underline text-sm p-1"
                          href=${`/archives/${this.archiveId}/crawls/${this.crawlTemplate.lastCrawlId}`}
                          @click=${this.navLink}
                          >${msg("View crawl")}</a
                        >
                        <sl-format-date
                          date=${
                            `${this.crawlTemplate.lastCrawlTime}Z` /** Z for UTC */
                          }
                          month="2-digit"
                          day="2-digit"
                          year="2-digit"
                          hour="numeric"
                          minute="numeric"
                          time-zone-name="short"
                        ></sl-format-date>`
                    : html`<span class="text-0-400 text-sm p-1"
                        >${msg("None")}</span
                      >`}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    `;
  }

  private renderReadOnlySchedule() {
    return html`
      <dl class="grid gap-5">
        <div>
          <dt class="text-sm text-0-600">${msg("Recurring crawls")}</dt>
          <dd>
            ${this.crawlTemplate!.schedule
              ? // TODO localize
                // NOTE human-readable string is in UTC, limitation of library
                // currently being used.
                // https://github.com/bradymholt/cRonstrue/issues/94
                html`<span
                  >${cronstrue.toString(this.crawlTemplate!.schedule, {
                    verbose: true,
                  })}
                  (in UTC time zone)</span
                >`
              : html`<span class="text-0-400">${msg("None")}</span>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderEditSchedule() {
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
    const initialInterval = this.crawlTemplate!.schedule
      ? getInitialScheduleInterval(this.crawlTemplate!.schedule)
      : "weekly";
    const nextSchedule =
      this.editedSchedule || scheduleIntervalsMap[initialInterval];

    return html`
      <sl-form @sl-submit=${this.onSubmitSchedule}>
        <div class="flex items-end">
          <div class="pr-2 flex-1">
            <sl-select
              name="scheduleInterval"
              label=${msg("Recurring crawls")}
              value=${initialInterval}
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

        <div class="mt-5">
          <sl-button type="primary" submit>${msg("Save schedule")}</sl-button>
        </div>
      </sl-form>
    `;
  }

  async getCrawlTemplate(): Promise<CrawlTemplate> {
    const data: CrawlTemplate = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs/${this.crawlConfigId}`,
      this.authState!
    );

    return data;
  }

  private async runNow(): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${
          this.crawlTemplate!.id
        }/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.crawlTemplate = {
        ...this.crawlTemplate,
        currCrawlId: crawlId,
      } as CrawlTemplate;

      this.notify({
        message: msg(
          str`Started crawl from <strong>${
            this.crawlTemplate!.name
          }</strong>. <br /><a class="underline hover:no-underline" href="/archives/${
            this.archiveId
          }/crawls/${data.run_now_job}">View crawl</a>`
        ),
        type: "success",
        icon: "check2-circle",
        duration: 10000,
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't run crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async onSubmitSchedule(event: {
    detail: { formData: FormData };
    target: any;
  }): Promise<void> {
    const { formData } = event.detail;
    const utcSchedule = getUTCSchedule({
      interval: formData.get("scheduleInterval") as any,
      hour: formData.get("scheduleHour") as any,
      minute: formData.get("scheduleMinute") as any,
      period: formData.get("schedulePeriod") as any,
    });

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${
          this.crawlTemplate!.id
        }/schedule`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({
            schedule: utcSchedule,
          }),
        }
      );

      this.notify({
        message: msg("Successfully saved new schedule."),
        type: "success",
        icon: "check2-circle",
      });

      this.navTo(`/archives/${this.archiveId}/crawl-templates`);
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update schedule."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
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
}

customElements.define("btrix-crawl-templates-detail", CrawlTemplatesDetail);
