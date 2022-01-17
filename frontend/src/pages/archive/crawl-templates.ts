import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type CrawlTemplate = any; // TODO

const initialValues = {
  name: `Example crawl ${Date.now()}`, // TODO remove placeholder
  runNow: true,
  schedule: `0 0 * * ${new Date().getDay()}`,
  timeHour: "00",
  timeMinute: "00",
  // crawlTimeoutMinutes: 0,
  seedUrls: "",
  scopeType: "prefix",
  // limit: 0,
};
const makeTimeOptions = (length: number) =>
  Array.from({ length }).map((x, i) => ({
    value: i,
    label: `${i}`.padStart(2, "0"),
  }));
const hours = makeTimeOptions(24);
const minutes = makeTimeOptions(60);

@localized()
export class CrawlTemplates extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: Boolean })
  isNew!: boolean;

  @property({ type: Array })
  crawlTemplates?: CrawlTemplate[];

  @state()
  isRunNow: boolean = initialValues.runNow;

  @state()
  cronSchedule: string = initialValues.schedule;

  render() {
    if (this.isNew) {
      return this.renderNew();
    }

    return this.renderList();
  }

  private renderNew() {
    return html`
      <h2 class="text-xl font-bold">${msg("New Crawl Template")}</h2>
      <p>
        ${msg(
          "Configure a new crawl template. You can choose to run a crawl immediately upon saving this template."
        )}
      </p>

      <main class="mt-4">
        <sl-form @sl-submit=${this.onSubmit}>
          <div class="border rounded-lg md:grid grid-cols-4">
            <div class="col-span-1 p-4 md:p-8 md:border-b">
              <h3 class="text-lg font-medium">${msg("Basic settings")}</h3>
            </div>
            <section class="col-span-3 p-4 md:p-8 border-b grid gap-5">
              <div>
                <sl-input
                  name="name"
                  label=${msg("Name")}
                  placeholder=${msg("Example (example.com) Weekly Crawl", {
                    desc: "Example crawl template name",
                  })}
                  autocomplete="off"
                  value=${initialValues.name}
                  required
                ></sl-input>
              </div>
              <div>
                <div class="flex items-end">
                  <div class="pr-2 flex-1">
                    <sl-select
                      name="schedule"
                      label=${msg("Schedule")}
                      value=${initialValues.schedule}
                      @sl-select=${(e: any) =>
                        this.setCronInterval(e.target.value)}
                    >
                      <!-- https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cron-schedule-syntax -->
                      <sl-menu-item value="">${msg("None")}</sl-menu-item>
                      <sl-menu-item value="0 0 * * *"
                        >${msg("Daily")}</sl-menu-item
                      >
                      <sl-menu-item value="0 0 * * ${new Date().getDay()}"
                        >${msg("Weekly")}</sl-menu-item
                      >
                      <sl-menu-item value="0 0 ${new Date().getDate()} * *"
                        >${msg("Monthly")}</sl-menu-item
                      >
                    </sl-select>
                  </div>
                  <div class="grid grid-flow-col gap-2 items-center">
                    <span class="px-1">${msg("at")}</span>
                    <sl-select
                      name="scheduleHour"
                      value="0"
                      class="w-24"
                      @sl-select=${(e: any) =>
                        this.setCronTime({ hour: e.target.value })}
                    >
                      ${hours.map(
                        ({ value, label }) =>
                          html`<sl-menu-item value=${value}
                            >${label}</sl-menu-item
                          >`
                      )}
                    </sl-select>
                    <span>:</span>
                    <sl-select
                      name="scheduleMinute"
                      value="0"
                      class="w-24"
                      @sl-select=${(e: any) =>
                        this.setCronTime({ minute: e.target.value })}
                    >
                      ${minutes.map(
                        ({ value, label }) =>
                          html`<sl-menu-item value=${value}
                            >${label}</sl-menu-item
                          >`
                      )}
                    </sl-select>
                    <span class="px-1">${msg("UTC")}</span>
                  </div>
                </div>
                <div class="text-sm text-gray-500 mt-1">
                  ${msg(
                    html`Next scheduled crawl:
                      <sl-format-date
                        date="${cronParser
                          .parseExpression(this.cronSchedule, {
                            utc: true,
                          })
                          .next()
                          .toString()}"
                        weekday="long"
                        month="long"
                        day="numeric"
                        year="numeric"
                        hour="numeric"
                        minute="numeric"
                        time-zone-name="short"
                        time-zone="utc"
                      ></sl-format-date>`
                  )}
                </div>
              </div>

              <div>
                <sl-switch
                  name="runNow"
                  ?checked=${initialValues.runNow}
                  @sl-change=${(e: any) => (this.isRunNow = e.target.checked)}
                  >${msg("Run immediately")}</sl-switch
                >
              </div>

              <div>
                <sl-input
                  name="crawlTimeoutMinutes"
                  label=${msg("Time limit")}
                  placeholder=${msg("unlimited")}
                  type="number"
                >
                  <span slot="suffix">${msg("minutes")}</span>
                </sl-input>
              </div>
            </section>

            <div class="col-span-1 p-4 md:p-8 md:border-b">
              <h3 class="text-lg font-medium">${msg("Pages")}</h3>
            </div>
            <section class="col-span-3 p-4 md:p-8 border-b grid gap-5">
              <div>
                <sl-textarea
                  name="seedUrls"
                  label=${msg("Seed URLs")}
                  helpText=${msg("Separated by a new line, space or comma")}
                  placeholder=${msg(
                    `https://webrecorder.net\nhttps://example.com`,
                    {
                      desc: "Example seed URLs",
                    }
                  )}
                  help-text=${msg(
                    "Separate URLs with a new line, space or comma."
                  )}
                  rows="3"
                  value=${initialValues.seedUrls}
                  required
                ></sl-textarea>
              </div>
              <div>
                <sl-select
                  name="scopeType"
                  label=${msg("Scope type")}
                  value=${initialValues.scopeType}
                >
                  <sl-menu-item value="page">Page</sl-menu-item>
                  <sl-menu-item value="page-spa">Page SPA</sl-menu-item>
                  <sl-menu-item value="prefix">Prefix</sl-menu-item>
                  <sl-menu-item value="host">Host</sl-menu-item>
                  <sl-menu-item value="any">Any</sl-menu-item>
                </sl-select>
              </div>
              <div>
                <sl-input
                  name="limit"
                  label=${msg("Page limit")}
                  type="number"
                  placeholder=${msg("unlimited")}
                >
                  <span slot="suffix">${msg("pages")}</span>
                </sl-input>
              </div>
            </section>

            <div class="col-span-4 p-4 md:p-8 text-center">
              <sl-button type="primary" submit
                >${msg("Save Crawl Template")}</sl-button
              >

              <div class="text-sm text-gray-500 mt-6">
                ${this.isRunNow
                  ? html`
                      <p class="mb-2">
                        ${msg("A crawl will start immediately on save.")}
                      </p>
                    `
                  : ""}

                <p>
                  ${msg(
                    html`Next scheduled crawl:
                      <sl-format-date
                        date="${cronParser
                          .parseExpression(this.cronSchedule, {
                            utc: true,
                          })
                          .next()
                          .toString()}"
                        weekday="long"
                        month="long"
                        day="numeric"
                        year="numeric"
                        hour="numeric"
                        minute="numeric"
                        time-zone-name="short"
                        time-zone="utc"
                      ></sl-format-date>`
                  )}
                </p>
              </div>
            </div>
          </div>
        </sl-form>
      </main>
    `;
  }

  private renderList() {
    return html`
      <div class="text-center">
        <sl-button
          @click=${() =>
            this.navTo(`/archives/${this.archiveId}/crawl-templates/new`)}
        >
          <sl-icon slot="prefix" name="plus-square-dotted"></sl-icon>
          ${msg("Create new crawl template")}
        </sl-button>
      </div>

      <div>
        ${this.crawlTemplates?.map(
          (template) => html`<div>${template.id}</div>`
        )}
      </div>
    `;
  }

  private async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    const { formData } = event.detail;

    const crawlTimeoutMinutes = formData.get("crawlTimeoutMinutes");
    const pageLimit = formData.get("limit");
    const seedUrlsStr = formData.get("seedUrls");
    const params = {
      name: formData.get("name"),
      schedule: formData.get("schedule"),
      runNow: this.isRunNow,
      crawlTimeout: crawlTimeoutMinutes ? +crawlTimeoutMinutes * 60 : 0,
      config: {
        seeds: (seedUrlsStr as string).trim().replace(/,/g, " ").split(/\s+/g),
        scopeType: formData.get("scopeType"),
        limit: pageLimit ? +pageLimit : 0,
      },
    };

    console.log(params);

    // try {
    //   await this.apiFetch(
    //     `/archives/${this.archiveId}/crawlconfigs/`,
    //     this.authState,
    //     {
    //       method: "POST",
    //       body: JSON.stringify(params),
    //     }
    //   );

    //   console.debug("success");

    //   this.navTo(`/archives/${this.archiveId}/crawl-templates`);
    // } catch (e) {
    //   console.error(e);
    // }
  }

  /** Set day, month or day of week in cron schedule */
  private setCronInterval(expression: string) {
    if (!expression) {
      this.cronSchedule = "";
      return;
    }

    const [minute, hour] = (this.cronSchedule || initialValues.schedule).split(
      " "
    );
    const [, , dayOfMonth, month, dayOfWeek] = expression.split(" ");

    this.cronSchedule = `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
  }

  /** Set minute or hour in cron schedule */
  private setCronTime(time: { hour?: string; minute?: string }) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = (
      this.cronSchedule || initialValues.schedule
    ).split(" ");

    this.cronSchedule = `${time.minute || minute} ${
      time.hour || hour
    } ${dayOfMonth} ${month} ${dayOfWeek}`;
  }
}
