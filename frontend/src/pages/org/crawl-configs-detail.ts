import type { HTMLTemplateResult, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, CrawlConfig, InitialCrawlConfig, JobType } from "./types";
import { humanizeNextDate } from "../../utils/cron";

/**
 * Usage:
 * ```ts
 * <btrix-crawl-configs-detail></btrix-crawl-configs-detail>
 * ```
 */
@localized()
export class CrawlTemplatesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlConfigId!: string;

  @property({ type: Boolean })
  isEditing: boolean = false;

  @state()
  private crawlConfig?: CrawlConfig;

  @state()
  private lastCrawl?: Crawl;

  @state()
  private isSubmittingUpdate: boolean = false;

  private readonly jobTypeLabels: Record<JobType, string> = {
    "url-list": msg("URL List"),
    "seed-crawl": msg("Seeded Crawl"),
    custom: msg("Custom"),
  };

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("crawlConfigId") && this.crawlConfigId) {
      this.initializeCrawlTemplate();
    }
  }

  protected updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("crawlConfig") &&
      !changedProperties.get("crawlConfig") &&
      this.crawlConfig &&
      window.location.hash
    ) {
      // Show section once crawl config is done rendering
      document.querySelector(window.location.hash)?.scrollIntoView();
    }
  }

  private async initializeCrawlTemplate() {
    try {
      this.crawlConfig = await this.getCrawlTemplate(this.crawlConfigId);
      if (this.crawlConfig.lastCrawlId)
        this.lastCrawl = await this.getCrawl(this.crawlConfig.lastCrawlId);
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
        <div class="grid grid-cols-1 gap-7">
          ${when(this.crawlConfig, this.renderEditor)}
        </div>
      `;
    }

    return html`
      <div class="grid grid-cols-1 gap-7">
        ${this.renderHeader()}

        <header class="col-span-1 md:flex justify-between items-end">
          <h2>
            ${this.crawlConfig?.name
              ? html`<span
                  class="inline-block align-middle text-xl leading-10 mr-1"
                  >${this.crawlConfig.name}</span
                > `
              : ""}
            ${when(
              this.crawlConfig?.inactive,
              () => html`
                <btrix-badge class="inline-block align-middle" variant="warning"
                  >${msg("Inactive")}</btrix-badge
                >
              `
            )}
          </h2>
          <div class="flex-0 flex">
            ${when(
              this.crawlConfig && !this.crawlConfig.inactive,
              () => html`
                <sl-button
                  href=${`/orgs/${this.orgId}/crawl-configs/config/${
                    this.crawlConfig!.id
                  }?edit`}
                  variant="primary"
                  class="mr-2"
                  @click=${this.navLink}
                >
                  <sl-icon slot="prefix" name="gear"></sl-icon>
                  ${msg("Edit Crawl Config")}
                </sl-button>
                ${this.renderMenu()}
              `,
              () =>
                this.crawlConfig?.newId
                  ? html`
                      <sl-button
                        size="small"
                        variant="text"
                        @click=${this.getNewerVersion}
                      >
                        <sl-icon slot="suffix" name="arrow-right"></sl-icon>
                        ${msg("Newer Version")}
                      </sl-button>
                    `
                  : ""
            )}
          </div>
        </header>

        <section class="col-span-1 border rounded-lg py-2">
          ${this.renderDetails()}
        </section>

        ${this.renderLastCrawl()} ${this.renderCurrentlyRunningNotice()}

        <div class="col-span-1">
          <h3 class="text-lg font-medium text-neutral-700 mb-2">
            ${msg("Crawl Settings")}
          </h3>
          <main class="border rounded-lg py-3 px-5">
            <btrix-config-details
              .crawlConfig=${this.crawlConfig}
              anchorLinks
            ></btrix-config-details>
          </main>
        </div>
      </div>
    `;
  }

  private renderHeader(configId?: string) {
    return html`
      <nav class="col-span-1">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/orgs/${this.orgId}/crawl-configs${
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
              ? msg(str`Back to ${this.crawlConfig?.name}`)
              : msg("Back to Crawl Configs")}</span
          >
        </a>
      </nav>
    `;
  }

  private renderEditor = () => html`
    ${this.renderHeader(this.crawlConfig!.id)}

    <header>
      <h2 class="text-xl leading-10">
        ${this.crawlConfig?.name
          ? html`<span>${this.crawlConfig.name}</span>`
          : ""}
      </h2>
    </header>

    <btrix-crawl-config-editor
      .initialCrawlConfig=${this.crawlConfig}
      jobType=${this.crawlConfig!.jobType}
      configId=${this.crawlConfig!.id}
      orgId=${this.orgId}
      .authState=${this.authState}
      @reset=${(e: Event) =>
        this.navTo(
          `/orgs/${this.orgId}/crawl-configs/config/${this.crawlConfig!.id}`
        )}
    ></btrix-crawl-config-editor>
  `;

  private renderMenu() {
    if (!this.crawlConfig) return;

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

    if (!this.crawlConfig.inactive) {
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

    if (this.crawlConfig.crawlCount && !this.crawlConfig.inactive) {
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

    if (!this.crawlConfig.crawlCount) {
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

  private renderCurrentlyRunningNotice() {
    if (this.crawlConfig?.currCrawlId) {
      return html`
        <a
          class="col-span-1 flex items-center justify-between px-3 py-2 border rounded-lg bg-purple-50 border-purple-200 hover:border-purple-500 shadow shadow-purple-200 text-purple-800 transition-colors"
          href=${`/orgs/${this.orgId}/crawls/crawl/${this.crawlConfig.currCrawlId}`}
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
    if (!this.crawlConfig) return;

    return html`
      <dl class="px-3 md:px-0 md:flex justify-evenly">
        ${this.renderDetailItem(
          msg("Crawl Count"),
          () => this.crawlConfig!.crawlCount
        )}
        ${this.renderDetailItem(msg("Next Run"), () =>
          this.crawlConfig!.schedule
            ? html`
                <div>
                  ${humanizeNextDate(this.crawlConfig!.schedule, {
                    length: "short",
                  })}
                </div>
              `
            : html`<span class="text-neutral-400"
                >${msg("Not Scheduled")}</span
              >`
        )}
        ${this.renderDetailItem(
          msg("Created By"),
          () => this.crawlConfig!.userName
        )}
        ${this.renderDetailItem(
          msg("Created At"),
          () => html`
            <sl-format-date
              date=${this.crawlConfig!.created}
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></sl-format-date>
          `,
          true
        )}
      </dl>
    `;
  }

  private renderLastCrawl() {
    if (!this.crawlConfig?.lastCrawlId) return;
    return html`
      <section class="col-span-1">
        <h3 class="text-lg font-medium text-neutral-700 mb-2">
          ${this.crawlConfig.currCrawlId
            ? msg("Last Completed Crawl")
            : msg("Latest Crawl")}
        </h3>
        <div class="border rounded shadow-sm">
          <btrix-crawl-list-item .crawl=${this.lastCrawl}>
            <sl-menu slot="menu">
              <sl-menu-item
                @click=${() =>
                  this.lastCrawl
                    ? this.navTo(
                        `/orgs/${this.orgId}/crawls/crawl/${this.lastCrawl.id}`
                      )
                    : false}
              >
                ${msg("View Crawl Details")}
              </sl-menu-item>
            </sl-menu>
          </btrix-crawl-list-item>
        </div>
      </section>
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
          this.crawlConfig,
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

  private getNewerVersion() {
    const versionId = this.crawlConfig?.newId;
    if (!versionId) return;
    this.navTo(`/orgs/${this.orgId}/crawl-configs/config/${versionId}`);
  }

  private async getCrawlTemplate(configId: string): Promise<CrawlConfig> {
    const data: CrawlConfig = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs/${configId}`,
      this.authState!
    );

    return data;
  }

  private async getCrawl(crawlId: string): Promise<Crawl> {
    const data: Crawl = await this.apiFetch(
      `/orgs/${this.orgId}/crawls/${crawlId}`,
      this.authState!
    );

    return data;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig() {
    if (!this.crawlConfig) return;

    const crawlTemplate: InitialCrawlConfig = {
      name: msg(str`${this.crawlConfig.name} Copy`),
      config: this.crawlConfig.config,
      profileid: this.crawlConfig.profileid || null,
      jobType: this.crawlConfig.jobType,
      schedule: this.crawlConfig.schedule,
      tags: this.crawlConfig.tags,
    };

    this.navTo(
      `/orgs/${this.orgId}/crawl-configs?new&jobType=${crawlTemplate.jobType}`,
      {
        crawlTemplate,
      }
    );

    this.notify({
      message: msg(str`Copied crawl configuration to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }

  private async deactivateTemplate(): Promise<void> {
    if (!this.crawlConfig) return;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.crawlConfig.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.crawlConfig = {
        ...this.crawlConfig,
        inactive: true,
      };

      this.notify({
        message: msg(
          html`Deactivated <strong>${this.crawlConfig.name}</strong>.`
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
    if (!this.crawlConfig) return;

    const isDeactivating = this.crawlConfig.crawlCount > 0;

    try {
      await this.apiFetch(
        `/orgs${this.orgId}/crawlconfigs/${this.crawlConfig.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.navTo(`/orgs/${this.orgId}/crawl-configs`);

      this.notify({
        message: isDeactivating
          ? msg(html`Deactivated <strong>${this.crawlConfig.name}</strong>.`)
          : msg(html`Deleted <strong>${this.crawlConfig.name}</strong>.`),
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
        `/orgs/${this.orgId}/crawlconfigs/${this.crawlConfig!.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.crawlConfig = {
        ...this.crawlConfig,
        currCrawlId: crawlId,
      } as CrawlConfig;

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.crawlConfig!.name}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${this.orgId}/crawls/crawl/${data.started}#watch"
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
}

customElements.define("btrix-crawl-configs-detail", CrawlTemplatesDetail);
