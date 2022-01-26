import { state, property } from "lit/decorators.js";
import { ref, createRef, Ref } from "lit/directives/ref.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlTemplate } from "./types";
import { getUTCSchedule } from "./utils";
import "../../components/crawl-scheduler";

type RunningCrawlsMap = {
  /** Map of configId: crawlId */
  [configId: string]: string;
};

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-list></btrix-crawl-templates-list>
 * ```
 */
@localized()
export class CrawlTemplatesList extends LiteElement {
  private dialogRef: Ref<any> = createRef();

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  crawlTemplates?: CrawlTemplate[];

  @state()
  runningCrawlsMap: RunningCrawlsMap = {};

  @state()
  selectedTemplateForEdit?: CrawlTemplate;

  private get timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  async firstUpdated() {
    try {
      this.crawlTemplates = await this.getCrawlTemplates();
      if (!this.crawlTemplates.length) {
        this.navTo(`/archives/${this.archiveId}/crawl-templates/new`);
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl templates at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.crawlTemplates) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <div
        class=${this.crawlTemplates.length
          ? "grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4"
          : "flex justify-center"}
      >
        <a
          href=${`/archives/${this.archiveId}/crawl-templates/new`}
          class="col-span-1 bg-slate-50 border border-indigo-200 hover:border-indigo-400 text-primary text-center font-medium rounded px-6 py-4 transition-colors"
          @click=${this.navLink}
          role="button"
        >
          <sl-icon
            class="inline-block align-middle mr-2"
            name="plus-square"
          ></sl-icon
          ><span
            class="inline-block align-middle mr-2 ${this.crawlTemplates.length
              ? "text-sm"
              : "font-medium"}"
            >${msg("Create New Crawl Template")}</span
          >
        </a>
      </div>

      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${this.crawlTemplates.map(
          (t) =>
            html`<div
              class="col-span-1 p-1 border hover:border-indigo-200 rounded text-sm transition-colors"
              aria-label=${t.name}
            >
              <header class="flex">
                <a
                  href=${`/archives/${this.archiveId}/crawl-templates/${t.id}`}
                  class="block flex-1 px-3 pt-3 font-medium hover:underline whitespace-nowrap truncate mb-1"
                  title=${t.name}
                  @click=${this.navLink}
                >
                  ${t.name || "?"}
                </a>

                <sl-dropdown>
                  <sl-icon-button
                    slot="trigger"
                    name="three-dots-vertical"
                    label="More"
                    style="font-size: 1rem"
                  ></sl-icon-button>

                  <ul class="text-sm whitespace-nowrap" role="menu">
                    <li
                      class="p-2 hover:bg-zinc-100 cursor-pointer"
                      role="menuitem"
                      @click=${(e: any) => {
                        e.target.closest("sl-dropdown").hide();
                        this.selectedTemplateForEdit = t;
                        this.dialogRef.value!.show();
                      }}
                    >
                      <sl-icon
                        class="inline-block align-middle px-1"
                        name="pencil-square"
                      ></sl-icon>
                      <span class="inline-block align-middle pr-2"
                        >${msg("Edit crawl schedule")}</span
                      >
                    </li>

                    <li
                      class="p-2 hover:bg-zinc-100 cursor-pointer"
                      role="menuitem"
                      @click=${() => this.duplicateConfig(t)}
                    >
                      <sl-icon
                        class="inline-block align-middle px-1"
                        name="files"
                      ></sl-icon>
                      <span class="inline-block align-middle pr-2"
                        >${msg("Duplicate crawl config")}</span
                      >
                    </li>
                    <li
                      class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
                      role="menuitem"
                      @click=${(e: any) => {
                        // Close dropdown before deleting template
                        e.target.closest("sl-dropdown").hide();

                        this.deleteTemplate(t);
                      }}
                    >
                      <sl-icon
                        class="inline-block align-middle px-1"
                        name="file-earmark-x"
                      ></sl-icon>
                      <span class="inline-block align-middle pr-2"
                        >${msg("Delete")}</span
                      >
                    </li>
                  </ul>
                </sl-dropdown>
              </header>

              <div class="px-3 pb-3 flex justify-between items-end">
                <div class="grid gap-2 text-xs leading-none">
                  <div class="overflow-hidden">
                    <sl-tooltip
                      content=${t.config.seeds
                        .map((seed) =>
                          typeof seed === "string" ? seed : seed.url
                        )
                        .join(", ")}
                    >
                      <div
                        class="font-mono whitespace-nowrap truncate text-0-500"
                      >
                        <span class="underline decoration-dashed"
                          >${t.config.seeds
                            .map((seed) =>
                              typeof seed === "string" ? seed : seed.url
                            )
                            .join(", ")}</span
                        >
                      </div>
                    </sl-tooltip>
                  </div>
                  <div class="font-mono text-purple-500">
                    ${t.crawlCount === 1
                      ? msg(str`${t.crawlCount} crawl`)
                      : msg(
                          str`${(t.crawlCount || 0).toLocaleString()} crawls`
                        )}
                  </div>
                  <div>
                    ${t.crawlCount
                      ? html`<sl-tooltip content=${msg("Last crawl time")}>
                          <span>
                            <sl-icon
                              class="inline-block align-middle mr-1 text-purple-400"
                              name="check-circle-fill"
                            ></sl-icon
                            ><sl-format-date
                              class="inline-block align-middle text-0-600"
                              date=${`${t.lastCrawlTime}Z` /** Z for UTC */}
                              month="2-digit"
                              day="2-digit"
                              year="2-digit"
                              hour="numeric"
                              minute="numeric"
                              time-zone=${this.timeZone}
                            ></sl-format-date>
                          </span>
                        </sl-tooltip>`
                      : html`
                          <sl-icon
                            class="inline-block align-middle mr-1 text-0-400"
                            name="slash-circle"
                          ></sl-icon
                          ><span class="inline-block align-middle text-0-400"
                            >${msg("No crawls")}</span
                          >
                        `}
                  </div>
                  <div>
                    ${t.schedule
                      ? html`
                          <sl-tooltip content=${msg("Next scheduled crawl")}>
                            <span>
                              <sl-icon
                                class="inline-block align-middle mr-1"
                                name="clock-history"
                              ></sl-icon
                              ><sl-format-date
                                class="inline-block align-middle text-0-600"
                                date="${cronParser
                                  .parseExpression(t.schedule, {
                                    utc: true,
                                  })
                                  .next()
                                  .toString()}"
                                month="2-digit"
                                day="2-digit"
                                year="2-digit"
                                hour="numeric"
                                minute="numeric"
                                time-zone=${this.timeZone}
                              ></sl-format-date>
                            </span>
                          </sl-tooltip>
                        `
                      : html`<sl-icon
                            class="inline-block align-middle mr-1 text-0-400"
                            name="slash-circle"
                          ></sl-icon
                          ><span class="inline-block align-middle text-0-400"
                            >${msg("No schedule")}</span
                          >`}
                  </div>
                </div>
                <div>
                  <button
                    class="text-xs border rounded px-2 h-7 ${this
                      .runningCrawlsMap[t.id]
                      ? "bg-purple-50"
                      : "bg-white"} border-purple-200 hover:border-purple-500 text-purple-600 transition-colors"
                    @click=${() =>
                      this.runningCrawlsMap[t.id]
                        ? this.navTo(
                            `/archives/${this.archiveId}/crawls/${
                              this.runningCrawlsMap[t.id]
                            }`
                          )
                        : this.runNow(t)}
                  >
                    <span class="whitespace-nowrap">
                      ${this.runningCrawlsMap[t.id]
                        ? msg("View crawl")
                        : msg("Run now")}
                    </span>
                  </button>
                </div>
              </div>
            </div>`
        )}
      </div>

      <!-- NOTE on ref usage: Using a reactive open attribute causes the dialog to close -->
      <!-- https://github.com/shoelace-style/shoelace/issues/170 -->
      <sl-dialog ${ref(this.dialogRef)} label=${msg(str`Edit Crawl Schedule`)}>
        <h2 class="text-lg font-medium mb-4">
          ${this.selectedTemplateForEdit?.name}
        </h2>
        <btrix-crawl-templates-scheduler
          .schedule=${this.selectedTemplateForEdit?.schedule}
          @submit=${this.onSubmitSchedule}
        ></btrix-crawl-templates-scheduler>
      </sl-dialog>
    `;
  }

  /**
   * Fetch crawl templates and record running crawls
   * associated with the crawl templates
   **/
  private async getCrawlTemplates(): Promise<CrawlTemplate[]> {
    const data: { crawlConfigs: CrawlTemplate[] } = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs`,
      this.authState!
    );

    const runningCrawlsMap: RunningCrawlsMap = {};

    data.crawlConfigs.forEach(({ id, currCrawlId }) => {
      if (currCrawlId) {
        runningCrawlsMap[id] = currCrawlId;
      }
    });

    this.runningCrawlsMap = runningCrawlsMap;

    return data.crawlConfigs;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig(template: CrawlTemplate) {
    const crawlConfig: CrawlTemplate["config"] = {
      seeds: template.config.seeds,
      scopeType: template.config.scopeType,
      limit: template.config.limit,
    };

    this.navTo(`/archives/${this.archiveId}/crawl-templates/new`, {
      crawlConfig,
    });

    this.notify({
      message: msg(str`Copied crawl configuration to new template.`),
      type: "success",
      icon: "check2-circle",
    });
  }

  private async deleteTemplate(template: CrawlTemplate): Promise<void> {
    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${template.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(str`Deleted <strong>${template.name}</strong>.`),
        type: "success",
        icon: "check2-circle",
      });

      this.crawlTemplates = this.crawlTemplates!.filter(
        (t) => t.id !== template.id
      );
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async runNow(template: CrawlTemplate): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${template.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.runningCrawlsMap = {
        ...this.runningCrawlsMap,
        [template.id]: crawlId,
      };

      this.notify({
        message: msg(
          str`Started crawl from <strong>${template.name}</strong>. <br /><a class="underline hover:no-underline" href="/archives/${this.archiveId}/crawls/${data.run_now_job}">View crawl</a>`
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
    if (!this.selectedTemplateForEdit) return;

    const { formData } = event.detail;
    const utcSchedule = getUTCSchedule({
      interval: formData.get("scheduleInterval") as any,
      hour: formData.get("scheduleHour") as any,
      minute: formData.get("scheduleMinute") as any,
      period: formData.get("schedulePeriod") as any,
    });
    const editedTemplateId = this.selectedTemplateForEdit.id;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${editedTemplateId}/schedule`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify({
            schedule: utcSchedule,
          }),
        }
      );

      this.crawlTemplates = this.crawlTemplates?.map((t) =>
        t.id === editedTemplateId
          ? {
              ...t,
              schedule: utcSchedule,
            }
          : t
      );
      this.selectedTemplateForEdit = undefined;
      this.dialogRef.value!.hide();

      this.notify({
        message: msg("Successfully saved new schedule."),
        type: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update schedule."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}

customElements.define("btrix-crawl-templates-list", CrawlTemplatesList);
