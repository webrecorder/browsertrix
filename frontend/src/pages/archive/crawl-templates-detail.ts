import type { HTMLTemplateResult, TemplateResult } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import { parse as yamlToJson, stringify as jsonToYaml } from "yaml";
import { mergeDeep } from "immutable";
import compact from "lodash/fp/compact";
import flow from "lodash/fp/flow";
import uniq from "lodash/fp/uniq";
import RegexColorize from "regex-colorize";
import ISO6391 from "iso-639-1";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { InitialCrawlTemplate } from "./crawl-templates-new";
import type { CrawlConfig, SeedConfig } from "./types";
import {
  getUTCSchedule,
  humanizeSchedule,
  humanizeNextDate,
} from "../../utils/cron";
import "../../components/crawl-scheduler";
import {
  ExclusionRemoveEvent,
  ExclusionChangeEvent,
} from "../../components/queue-exclusion-table";

type EditCrawlConfig = Pick<
  SeedConfig,
  "seeds" | "scopeType" | "limit" | "extraHops" | "exclude" | "lang"
>;

// Show default empty editable rows
const defaultExclusions = [""];

const trimExclusions = flow(uniq, compact);

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
  private crawlTemplate?: CrawlConfig;

  @state()
  private isSubmittingUpdate: boolean = false;

  private readonly scopeTypeLabels: Record<
    CrawlConfig["config"]["scopeType"],
    string
  > = {
    prefix: msg("Path Begins with This URL"),
    host: msg("Pages on This Domain"),
    domain: msg("Pages on This Domain & Subdomains"),
    "page-spa": msg("Single Page App (In-Page Links Only)"),
    page: msg("Page"),
    custom: msg("Custom"),
    any: msg("Any"),
  };

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("crawlConfigId") && this.crawlConfigId) {
      this.initializeCrawlTemplate();
    }
  }

  private async initializeCrawlTemplate() {
    try {
      this.crawlTemplate = await this.getCrawlTemplate();
    } catch (e: any) {
      this.notify({
        message:
          e.statusCode === 404
            ? msg("Crawl config not found.")
            : msg("Sorry, couldn't retrieve crawl config at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  render() {
    if (this.isEditing) {
      return html`
        <div class="grid grid-cols-1 gap-5">
          ${when(this.crawlTemplate, this.renderEditor)}
        </div>
      `;
    }

    return html`
      <div class="grid grid-cols-1 gap-5">
        ${this.renderHeader()} ${this.renderInactiveNotice()}

        <header class="py-4 md:flex justify-between items-end">
          <h2 class="text-xl leading-10">
            ${this.crawlTemplate?.name
              ? html`<span>${this.crawlTemplate.name}</span> `
              : ""}
          </h2>
          <div class="flex-0 flex">
            ${when(
              this.crawlTemplate && !this.crawlTemplate.inactive,
              () => html`
                <sl-button
                  href=${`/archives/${this.archiveId}/crawl-templates/config/${
                    this.crawlTemplate!.id
                  }?edit`}
                  variant="primary"
                  class="mr-2"
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="gear"></sl-icon>
                  ${msg("Edit Crawl Config")}
                </sl-button>
              `
            )}
            ${this.renderMenu()}
          </div>
        </header>

        <section class="border rounded-lg py-2">
          ${this.renderDetails()}
        </section>

        ${this.renderCurrentlyRunningNotice()}

        <!-- <btrix-tab-list class="mt-2">
          <btrix-tab slot="nav" name="TODO">${msg("View Config")}</btrix-tab>
          <btrix-tab slot="nav" name="TODO">${msg(
          "Crawl History"
        )}</btrix-tab> -->

        <div>
          <header slot="header" class="flex justify-between mb-2">
            <div class="text-lg text-neutral-700 font-medium">
              ${msg("View Config")}
            </div>
            <div class="flex items-center">
              <span class="text-xs text-neutral-500 mr-2"
                >${msg("Config Version:")}</span
              >
              <btrix-icon-button
                class="mr-1"
                name="chevron-left"
                variant="primary"
                custom
              ></btrix-icon-button>
              <btrix-icon-button
                name="chevron-right"
                variant="primary"
                custom
              ></btrix-icon-button>
            </div>
          </header>
          ${when(this.crawlTemplate, this.renderViewConfig)}
        </div>
        <!-- </btrix-tab-list> -->
      </div>
    `;
  }

  private renderHeader(configId?: string) {
    return html`
      <nav>
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/archives/${this.archiveId}/crawl-templates${
            configId ? `/config/${configId}` : ""
          }`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${configId
              ? msg(str`Back to ${this.crawlTemplate?.name}`)
              : msg("Back to Crawl Configs")}</span
          >
        </a>
      </nav>
    `;
  }

  private renderEditor = () => html`
    ${this.renderHeader(this.crawlTemplate!.id)}

    <header>
      <h2 class="text-xl leading-10">
        ${this.crawlTemplate?.name
          ? html`<span>${this.crawlTemplate.name}</span>`
          : ""}
      </h2>
    </header>

    <btrix-crawl-config-editor
      .initialJobConfig=${this.crawlTemplate}
      jobType=${this.crawlTemplate!.jobType}
      configId=${this.crawlTemplate!.id}
      archiveId=${this.archiveId}
      .authState=${this.authState}
      @reset=${(e: Event) =>
        this.navTo(
          `/archives/${this.archiveId}/crawl-templates/config/${
            this.crawlTemplate!.id
          }`
        )}
    ></btrix-crawl-config-editor>
  `;

  private renderMenu() {
    if (!this.crawlTemplate) return;

    const closeDropdown = (e: any) => {
      e.target.closest("sl-dropdown").hide();
    };

    const menuItems: HTMLTemplateResult[] = [
      html`
        <li
          class="p-2 hover:bg-zinc-100 cursor-pointer"
          role="menuitem"
          @click=${() => this.duplicateConfig()}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="files"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Duplicate crawl config")}</span
          >
        </li>
      `,
    ];

    if (!this.crawlTemplate.inactive) {
      menuItems.unshift(html`
        <li
          class="p-2 hover:bg-purple-50 cursor-pointer text-purple-600"
          role="menuitem"
          @click=${(e: any) => {
            closeDropdown(e);
            this.runNow();
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="arrow-right-circle"
          ></sl-icon>
          <span class="inline-block align-middle pr-2">${msg("Run now")}</span>
        </li>
        <hr />
      `);
    }

    if (this.crawlTemplate.crawlCount && !this.crawlTemplate.inactive) {
      menuItems.push(html`
        <li
          class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            closeDropdown(e);

            this.deactivateTemplate();
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="file-earmark-minus"
          ></sl-icon>
          <span class="inline-block align-middle pr-2"
            >${msg("Deactivate")}</span
          >
        </li>
      `);
    }

    if (!this.crawlTemplate.crawlCount) {
      menuItems.push(html`
        <li
          class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
          role="menuitem"
          @click=${(e: any) => {
            this.deleteTemplate();
          }}
        >
          <sl-icon
            class="inline-block align-middle px-1"
            name="file-earmark-x"
          ></sl-icon>
          <span class="inline-block align-middle pr-2">${msg("Delete")}</span>
        </li>
      `);
    }

    return html`
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button slot="trigger" caret>${msg("Actions")}</sl-button>

        <ul
          class="text-left text-sm text-neutral-800 bg-white whitespace-nowrap"
          role="menu"
        >
          ${menuItems.map((item: HTMLTemplateResult) => item)}
        </ul>
      </sl-dropdown>
    `;
  }

  private renderInactiveNotice() {
    if (this.crawlTemplate?.inactive) {
      if (this.crawlTemplate?.newId) {
        return html`
          <btrix-alert variant="info">
            <sl-icon
              name="exclamation-octagon"
              class="inline-block align-middle mr-2"
            ></sl-icon>
            <span class="inline-block align-middle">
              ${msg("This crawl config is inactive.")}
              <a
                class="font-medium underline hover:no-underline"
                href=${`/archives/${this.archiveId}/crawl-templates/config/${this.crawlTemplate.newId}`}
                @click=${this.navLink}
                >${msg("Go to newer version")}</a
              >
            </span>
          </btrix-alert>
        `;
      }

      return html`
        <btrix-alert variant="warning">
          <sl-icon
            name="exclamation-octagon"
            class="inline-block align-middle mr-2"
          ></sl-icon>
          <span class="inline-block align-middle">
            ${msg("This crawl config is inactive.")}
          </span>
        </btrix-alert>
      `;
    }

    return "";
  }

  private renderCurrentlyRunningNotice() {
    if (this.crawlTemplate?.currCrawlId) {
      return html`
        <a
          class="flex items-center justify-between px-3 py-2 border rounded-lg bg-purple-50 border-purple-200 hover:border-purple-500 shadow shadow-purple-200 text-purple-800 transition-colors"
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

  private renderDetails() {
    return html`
      <dl class="px-3 md:px-0 md:flex justify-evenly">
        ${this.renderDetailItem(msg("Last Run"), () =>
          this.crawlTemplate!.lastCrawlTime
            ? html`<sl-format-date
                date=${this.crawlTemplate!.lastCrawlTime}
                month="numeric"
                day="numeric"
                year="numeric"
                hour="numeric"
                minute="numeric"
              ></sl-format-date>`
            : html`<span class="text-neutral-400">${msg("Never")}</span>`
        )}
        ${this.renderDetailItem(msg("Next Run"), () =>
          this.crawlTemplate!.schedule
            ? html`
                <div>
                  ${humanizeNextDate(this.crawlTemplate!.schedule, {
                    length: "short",
                  })}
                </div>
              `
            : html`<span class="text-neutral-400"
                >${msg("Not Scheduled")}</span
              >`
        )}
        ${this.renderDetailItem(
          msg("Run Count"),
          () => this.crawlTemplate!.crawlCount
        )}
        ${this.renderDetailItem(msg("Schedule"), () =>
          this.crawlTemplate!.schedule
            ? html`<sl-icon
                  name="calendar3"
                  class="inline-block align-middle mr-1"
                ></sl-icon>
                <span class="inline-block align-middle">
                  ${msg("Recurring Schedule")}
                </span>`
            : html`<span class="text-neutral-400">${msg("None")}</span>`
        )}
        ${this.renderDetailItem(
          msg("Last Updated By"),
          () => this.crawlTemplate!.userName,
          true
        )}
      </dl>
    `;
  }

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: () => any,
    isLast = false
  ) {
    return html`
      <btrix-desc-list-item class="py-1" label=${label}>
        ${when(
          this.crawlTemplate,
          renderContent,
          () => html`<sl-skeleton class="w-full"></sl-skeleton>`
        )}
      </btrix-desc-list-item>
      ${when(
        !isLast,
        () => html`<hr class="flex-0 border-l w-0" style="height: inherit" />`
      )}
    `;
  }

  private renderViewConfig = () => {
    if (!this.crawlTemplate) return;
    const crawlConfig = this.crawlTemplate;
    const exclusions = crawlConfig?.config.exclude || [];
    return html`
      <section class="border rounded-lg py-2 mb-4">
        <dl class="px-3 md:px-0 md:flex justify-evenly">
          ${this.renderDetailItem(
            msg("Created At"),
            () => html`
              <sl-format-date
                date=${crawlConfig.created}
                month="numeric"
                day="numeric"
                year="numeric"
                hour="numeric"
                minute="numeric"
              ></sl-format-date>
            `
          )}
          ${this.renderDetailItem(msg("Created By"), () => "TODO", true)}
        </dl>
      </section>

      <main class="border rounded-lg py-4 px-6">
        <section class="mb-6">
          <btrix-section-heading
            ><h4>${msg("Crawl Information")}</h4></btrix-section-heading
          >
          <btrix-desc-list>
            ${this.renderSetting(msg("Name"), crawlConfig.name)}
          </btrix-desc-list>
        </section>
        <section class="mb-6">
          <btrix-section-heading
            ><h4>${msg("Crawler Setup")}</h4></btrix-section-heading
          >
          <btrix-desc-list>
            ${when(
              crawlConfig.jobType === "seed-crawl",
              this.renderConfirmSeededSettings,
              this.renderConfirmUrlListSettings
            )}
            ${this.renderSetting(
              msg("Exclusions"),
              html`
                ${when(
                  exclusions.length,
                  () => html`
                    <btrix-queue-exclusion-table
                      .exclusions=${exclusions}
                      label=""
                    >
                    </btrix-queue-exclusion-table>
                  `,
                  () => msg("None")
                )}
              `
            )}
            ${this.renderSetting(
              msg("Crawl Time Limit"),
              crawlConfig.crawlTimeout
                ? msg(str`${crawlConfig.crawlTimeout / 60} minute(s)`)
                : msg("None")
            )}
            ${this.renderSetting(msg("Crawler Instances"), crawlConfig.scale)}
          </btrix-desc-list>
        </section>
        <section class="mb-6">
          <btrix-section-heading
            ><h4>${msg("Browser Settings")}</h4></btrix-section-heading
          >
          <btrix-desc-list>
            ${this.renderSetting(
              msg("Browser Profile"),
              when(
                crawlConfig.profileid,
                () => html`<a
                  class="text-blue-500 hover:text-blue-600"
                  href=${`/archives/${this.archiveId}/browser-profiles/profile/${crawlConfig.profileid}`}
                  @click=${this.navLink}
                >
                  ${crawlConfig.profileName}
                </a>`,
                () => msg("Default Profile")
              )
            )}
            ${this.renderSetting(
              msg("Block Ads by Domain"),
              crawlConfig.config.blockAds
            )}
            ${this.renderSetting(
              msg("Language"),
              ISO6391.getName(crawlConfig.config.lang!)
            )}
            ${this.renderSetting(
              msg("Page Time Limit"),
              crawlConfig.config.behaviorTimeout
                ? msg(str`${crawlConfig.config.behaviorTimeout / 60} minute(s)`)
                : msg("None")
            )}
          </btrix-desc-list>
        </section>
        <section>
          <btrix-section-heading
            ><h4>${msg("Crawl Scheduling")}</h4></btrix-section-heading
          >
          <btrix-desc-list>
            ${this.renderSetting(
              msg("Crawl Schedule Type"),
              crawlConfig.schedule
                ? msg("Run on a Recurring Basis")
                : msg("No Schedule")
            )}
            ${when(crawlConfig.schedule, () =>
              this.renderSetting(
                msg("Schedule"),
                humanizeSchedule(crawlConfig.schedule)
              )
            )}
          </btrix-desc-list>
        </section>
      </main>
    `;
  };

  private renderSetting(label: string, value: any) {
    let content = value;

    if (typeof value === "boolean") {
      content = value ? msg("Yes") : msg("No");
    } else if (typeof value !== "number" && !value) {
      content = html`<span class="text-neutral-300"
        >${msg("Not specified")}</span
      >`;
    }
    return html`
      <btrix-desc-list-item label=${label}> ${content} </btrix-desc-list-item>
    `;
  }

  private renderConfirmUrlListSettings = () => {
    const crawlConfig = this.crawlTemplate!;
    return html`
      ${this.renderSetting(
        msg("List of URLs"),
        html`
          <ul>
            ${crawlConfig.config.seeds.map((url) => html` <li>${url}</li> `)}
          </ul>
        `
      )}
      ${this.renderSetting(
        msg("Include Linked Pages"),
        Boolean(crawlConfig.config.extraHops)
      )}
    `;
  };

  private renderConfirmSeededSettings = () => {
    const crawlConfig = this.crawlTemplate!;
    return html`
      ${this.renderSetting(
        msg("Primary Seed URL"),
        crawlConfig.config.seeds[0]
      )}
      ${this.renderSetting(
        msg("Crawl Scope"),
        this.scopeTypeLabels[crawlConfig.config.scopeType]
      )}
      ${this.renderSetting(
        msg("Allowed URL Prefixes"),
        crawlConfig.config.include?.length
          ? html`
              <ul>
                ${crawlConfig.config.include.map(
                  (url) =>
                    staticHtml`<li class="regex">${unsafeStatic(
                      new RegexColorize().colorizeText(url)
                    )}</li>`
                )}
              </ul>
            `
          : msg("None")
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(crawlConfig.config.extraHops)
      )}
      ${this.renderSetting(
        msg("Max Pages"),
        crawlConfig.config.limit
          ? msg(str`${crawlConfig.config.limit} pages`)
          : msg("Unlimited")
      )}
    `;
  };

  async getCrawlTemplate(): Promise<CrawlConfig> {
    const data: CrawlConfig = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs/${this.crawlConfigId}`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig() {
    if (!this.crawlTemplate) return;

    const crawlTemplate: InitialCrawlTemplate = {
      name: msg(str`${this.crawlTemplate.name} Copy`),
      config: this.crawlTemplate.config,
      profileid: this.crawlTemplate.profileid || null,
      jobType: this.crawlTemplate.jobType,
      schedule: this.crawlTemplate.schedule,
    };

    this.navTo(`/archives/${this.archiveId}/crawl-templates/new`, {
      crawlTemplate,
    });

    this.notify({
      message: msg(str`Copied crawl configuration to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }

  private async deactivateTemplate(): Promise<void> {
    if (!this.crawlTemplate) return;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${this.crawlTemplate.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.crawlTemplate = {
        ...this.crawlTemplate,
        inactive: true,
      };

      this.notify({
        message: msg(
          html`Deactivated <strong>${this.crawlTemplate.name}</strong>.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate crawl config at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteTemplate(): Promise<void> {
    if (!this.crawlTemplate) return;

    const isDeactivating = this.crawlTemplate.crawlCount > 0;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${this.crawlTemplate.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.navTo(`/archives/${this.archiveId}/crawl-templates`);

      this.notify({
        message: isDeactivating
          ? msg(html`Deactivated <strong>${this.crawlTemplate.name}</strong>.`)
          : msg(html`Deleted <strong>${this.crawlTemplate.name}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: isDeactivating
          ? msg("Sorry, couldn't deactivate crawl config at this time.")
          : msg("Sorry, couldn't delete crawl config at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
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
      } as CrawlConfig;

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.crawlTemplate!.name}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/archives/${this
                .archiveId}/crawls/crawl/${data.started}#watch"
              @click=${this.navLink.bind(this)}
              >Watch crawl</a
            >`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't run crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  /**
   * Create new crawl config with revised crawl configuration
   * @param config Crawl config object
   */
  private async createRevisedTemplate({
    config,
    profileId,
  }: {
    config?: EditCrawlConfig;
    profileId: CrawlConfig["profileid"];
  }) {
    this.isSubmittingUpdate = true;

    const params = {
      oldId: this.crawlTemplate!.id,
      name: this.crawlTemplate!.name,
      schedule: this.crawlTemplate!.schedule,
      profileid: profileId,
      config,
    };

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      this.navTo(
        `/archives/${this.archiveId}/crawl-templates/config/${data.added}`
      );

      this.notify({
        message: msg("Crawl config updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update crawl config."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
  }

  /**
   * Update crawl config properties
   * @param params Crawl config properties to update
   */
  private async updateTemplate(params: Partial<CrawlConfig>): Promise<void> {
    this.isSubmittingUpdate = true;

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${this.crawlTemplate!.id}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        }
      );

      if (data.success === true) {
        this.crawlTemplate = {
          ...this.crawlTemplate!,
          ...params,
        };

        this.notify({
          message: msg("Successfully saved changes."),
          variant: "success",
          icon: "check2-circle",
        });
      } else {
        throw data;
      }
    } catch (e: any) {
      console.error(e);

      this.notify({
        message: msg("Something went wrong, couldn't update crawl config."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingUpdate = false;
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

customElements.define("btrix-crawl-templates-detail", CrawlTemplatesDetail);
