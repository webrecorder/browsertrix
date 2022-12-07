import type { HTMLTemplateResult, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import { parse as yamlToJson, stringify as jsonToYaml } from "yaml";
import { mergeDeep } from "immutable";
import compact from "lodash/fp/compact";
import flow from "lodash/fp/flow";
import uniq from "lodash/fp/uniq";
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

        <main class="md:border md:rounded-lg">TODO</main>
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
          ? html`<span>${this.crawlTemplate.name}</span> `
          : ""}
      </h2>
    </header>

    <btrix-crawl-config-editor
      .initialJobConfig=${this.crawlTemplate}
      jobType=${"urlList"}
      configId=${this.crawlTemplate!.id}
      archiveId=${this.archiveId}
      .authState=${this.authState}
      @reset=${(e: Event) => {
        console.log("TODO");
      }}
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
      <div class="py-1">
        <dt class="text-xs text-neutral-500">${label}</dt>
        <dd class="font-monostyle">
          ${when(
            this.crawlTemplate,
            renderContent,
            () => html`<sl-skeleton class="w-full"></sl-skeleton>`
          )}
        </dd>
      </div>
      ${when(
        !isLast,
        () => html`<hr class="flex-0 border-l w-0" style="height: inherit" />`
      )}
    `;
  }

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
