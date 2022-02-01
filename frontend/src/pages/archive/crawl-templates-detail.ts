import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronstrue from "cronstrue"; // TODO localize

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { getLocaleTimeZone } from "../../utils/localization";
import type { CrawlTemplate } from "./types";
import { getUTCSchedule } from "./utils";
import "../../components/crawl-scheduler";

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

  async firstUpdated() {
    try {
      this.crawlTemplate = await this.getCrawlTemplate();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  render() {
    const seeds = this.crawlTemplate?.config.seeds || [];

    return html`
      <nav class="mb-5">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/archives/${this.archiveId}/crawl-templates`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Crawl Templates")}</span
          >
        </a>
      </nav>

      <h2 class="text-xl font-bold mb-4 h-7">
        ${this.crawlTemplate?.name ||
        html`<sl-skeleton class="h-7" style="width: 20em"></sl-skeleton>`}
      </h2>

      ${this.renderCurrentlyRunningNotice()}

      <section class="px-4 py-3 border-t border-b mb-4 text-sm">
        <dl class="grid grid-cols-2">
          <div>
            <dt class="text-xs text-0-600">${msg("Created at")}</dt>
            <dd class="h-5">
              ${this.crawlTemplate?.created
                ? html`
                    <sl-format-date
                      date=${`${this.crawlTemplate.created}Z` /** Z for UTC */}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="numeric"
                      minute="numeric"
                      time-zone-name="short"
                    ></sl-format-date>
                  `
                : html`<sl-skeleton style="width: 15em"></sl-skeleton>`}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-0-600">${msg("Created by")}</dt>
            <!-- TODO show name -->
            <dd class="h-5">
              ${this.crawlTemplate?.userName ||
              this.crawlTemplate?.userid ||
              html`<sl-skeleton style="width: 15em"></sl-skeleton>`}
            </dd>
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
                ${seeds
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

              ${seeds.length > SEED_URLS_MAX
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
                    ${seeds.length - SEED_URLS_MAX}
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
                  this.crawlTemplate?.config || {},
                  null,
                  2
                )}</code></pre>

                <div class="absolute top-2 right-2">
                  <btrix-copy-button
                    .value="${JSON.stringify(
                      this.crawlTemplate?.config || {},
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
                ${this.crawlTemplate
                  ? html`
                      <sl-button
                        size="small"
                        href=${`/archives/${
                          this.archiveId
                        }/crawl-templates/config/${this.crawlTemplate.id}${
                          this.isEditing ? "" : "?edit=true"
                        }`}
                        @click=${(e: any) => {
                          const hasChanges =
                            this.isEditing && this.editedSchedule;
                          if (
                            !hasChanges ||
                            window.confirm(
                              msg(
                                "You have unsaved schedule changes. Are you sure?"
                              )
                            )
                          ) {
                            this.navLink(e);
                            this.editedSchedule = "";
                          } else {
                            e.preventDefault();
                          }
                        }}
                      >
                        ${this.isEditing ? msg("Cancel") : msg("Edit")}
                      </sl-button>
                    `
                  : html`<sl-skeleton></sl-skeleton>`}
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
                  ${(this.crawlTemplate?.crawlCount || 0).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">
                  ${msg("Currently Running Crawl")}
                </dt>
                <dd
                  class="flex items-center justify-between border border-zinc-100 rounded p-1 mt-1"
                >
                  ${this.crawlTemplate
                    ? html`
                        ${this.crawlTemplate.currCrawlId
                          ? html` <a
                              class="text-primary font-medium hover:underline text-sm p-1"
                              href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlTemplate.currCrawlId}`}
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
                      `
                    : html` <sl-skeleton style="width: 6em"></sl-skeleton> `}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Latest Crawl")}</dt>
                <dd
                  class="flex items-center justify-between border border-zinc-100 rounded p-1 mt-1"
                >
                  ${this.crawlTemplate?.lastCrawlId
                    ? html`<a
                          class="text-primary font-medium hover:underline text-sm p-1"
                          href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlTemplate.lastCrawlId}`}
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

  private renderCurrentlyRunningNotice() {
    if (this.crawlTemplate?.currCrawlId) {
      return html`
        <a
          class="flex items-center justify-between mb-4 px-3 py-2 border rounded-lg bg-purple-50 border-purple-200 hover:border-purple-500 shadow shadow-purple-200 text-purple-800 transition-colors"
          href=${`/archives/${this.archiveId}/crawls/crawl/${this.crawlTemplate.currCrawlId}`}
          @click=${this.navLink}
        >
          <span>${msg("View currently running crawl")}</span>
          <sl-icon name="arrow-right"></sl-icon>
        </a>
      `;
    }

    return "";
  }

  private renderReadOnlySchedule() {
    return html`
      <dl class="grid gap-5">
        <div>
          <dt class="text-sm text-0-600">${msg("Recurring crawls")}</dt>
          <dd>
            ${this.crawlTemplate
              ? html`
                  ${this.crawlTemplate.schedule
                    ? // TODO localize
                      // NOTE human-readable string is in UTC, limitation of library
                      // currently being used.
                      // https://github.com/bradymholt/cRonstrue/issues/94
                      html`<span
                        >${cronstrue.toString(this.crawlTemplate.schedule, {
                          verbose: true,
                        })}
                        (in UTC time zone)</span
                      >`
                    : html`<span class="text-0-400">${msg("None")}</span>`}
                `
              : html`<sl-skeleton></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderEditSchedule() {
    if (!this.crawlTemplate) {
      return "";
    }

    return html`
      <btrix-crawl-templates-scheduler
        schedule=${this.crawlTemplate.schedule}
        @submit=${this.onSubmitSchedule}
      ></btrix-crawl-templates-scheduler>
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
          html`Started crawl from <strong>${this.crawlTemplate!.name}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/archives/${this.archiveId}/crawls/crawl/${data.started}"
              @click=${this.navLink.bind(this)}
              >View crawl</a
            >`
        ),
        type: "success",
        icon: "check2-circle",
        duration: 8000,
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
    const interval = formData.get("scheduleInterval");
    let schedule = "";

    if (interval) {
      schedule = getUTCSchedule({
        interval: formData.get("scheduleInterval") as any,
        hour: formData.get("scheduleHour") as any,
        minute: formData.get("scheduleMinute") as any,
        period: formData.get("schedulePeriod") as any,
      });
    }

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${
          this.crawlTemplate!.id
        }/schedule`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({ schedule }),
        }
      );

      this.crawlTemplate!.schedule = schedule;

      this.notify({
        message: msg("Successfully saved new schedule."),
        type: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/archives/${this.archiveId}/crawl-templates/config/${
          this.crawlTemplate!.id
        }`
      );
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
