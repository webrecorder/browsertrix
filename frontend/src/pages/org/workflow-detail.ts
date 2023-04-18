import type { HTMLTemplateResult, TemplateResult } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";

import { CopyButton } from "../../components/copy-button";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl, Workflow, WorkflowParams, JobType } from "./types";
import { humanizeNextDate } from "../../utils/cron";
import { APIPaginatedList } from "../../types/api";

const SECTIONS = ["artifacts", "watch", "settings"] as const;
type Tab = (typeof SECTIONS)[number];

/**
 * Usage:
 * ```ts
 * <btrix-workflow-detail></btrix-workflow-detail>
 * ```
 */
@localized()
export class WorkflowDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  workflowId!: string;

  @property({ type: Boolean })
  isEditing: boolean = false;

  @property({ type: Boolean })
  isCrawler!: boolean;

  @state()
  private workflow?: Workflow;

  @state()
  private crawls: Crawl[] = [];

  @state()
  private activePanel: Tab = "artifacts";

  @state()
  private isSubmittingUpdate: boolean = false;

  private readonly jobTypeLabels: Record<JobType, string> = {
    "url-list": msg("URL List"),
    "seed-crawl": msg("Seeded Crawl"),
    custom: msg("Custom"),
  };

  private readonly tabLabels: Record<Tab, string> = {
    artifacts: msg("Crawls"),
    watch: msg("Watch Crawl"),
    settings: msg("Workflow Settings"),
  };

  connectedCallback(): void {
    // Set initial active section based on URL #hash value
    const hash = window.location.hash.slice(1);
    if (SECTIONS.includes(hash as any)) {
      this.activePanel = hash as Tab;
    }
    super.connectedCallback();
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (
      (changedProperties.has("workflowId") && this.workflowId) ||
      (changedProperties.get("isEditing") === true && this.isEditing === false)
    ) {
      this.initWorkflow();
    }
  }

  protected updated(changedProperties: Map<string, any>) {
    if (
      (changedProperties.has("crawlConfig") &&
        !changedProperties.get("crawlConfig") &&
        this.workflow &&
        window.location.hash) ||
      (changedProperties.get("isEditing") === true && this.isEditing === false)
    ) {
      // Show section once Workflow is done rendering
      document.querySelector(window.location.hash)?.scrollIntoView();
    }
  }

  private async initWorkflow() {
    try {
      const [workflow, crawls] = await Promise.all([
        this.getWorkflow(),
        this.getCrawls(),
      ]);
      this.workflow = workflow;
      this.crawls = crawls;
    } catch (e: any) {
      this.notify({
        message:
          e.statusCode === 404
            ? msg("Workflow not found.")
            : msg("Sorry, couldn't retrieve Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  render() {
    if (this.isEditing && this.isCrawler) {
      return html`
        <div class="grid grid-cols-1 gap-7">
          ${when(this.workflow, this.renderEditor)}
        </div>
      `;
    }

    return html`
      <div class="grid grid-cols-1 gap-7">
        ${this.renderHeader()}

        <header class="col-span-1 md:flex justify-between items-end">
          <h2>
            <span
              class="inline-block align-middle text-xl font-semibold leading-10 md:mr-2"
              >${this.renderName()}</span
            >
            ${when(
              this.workflow?.inactive,
              () => html`
                <btrix-badge class="inline-block align-middle" variant="warning"
                  >${msg("Inactive")}</btrix-badge
                >
              `
            )}
          </h2>
          <div class="flex-0 flex justify-end">
            ${when(
              this.isCrawler && this.workflow && !this.workflow.inactive,
              this.renderMenu
            )}
          </div>
        </header>

        <section class="col-span-1 border rounded-lg py-2">
          ${this.renderDetails()}
        </section>

        <btrix-tab-list activePanel=${this.activePanel} hideIndicator>
          <header slot="header" class="flex items-end justify-between h-5">
            <h3>${this.tabLabels[this.activePanel]}</h3>
          </header>
          ${this.renderTab("artifacts")} ${this.renderTab("watch")}
          ${this.renderTab("settings")}

          <btrix-tab-panel name="artifacts"
            >${this.renderArtifacts()}</btrix-tab-panel
          >
          <btrix-tab-panel name="watch"
            >${this.renderWatchCrawl()}</btrix-tab-panel
          >
          <btrix-tab-panel name="settings">
            ${this.renderSettings()}
          </btrix-tab-panel>
        </btrix-tab-list>
      </div>
    `;
  }

  private renderHeader(configId?: string) {
    return html`
      <nav class="col-span-1">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/orgs/${this.orgId}/workflows${
            configId ? `/config/${configId}` : "/crawls"
          }`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${configId
              ? msg(str`Back to ${this.renderName()}`)
              : msg("Back to Crawl Workflows")}</span
          >
        </a>
      </nav>
    `;
  }

  private renderTab(tabName: Tab) {
    const isActive = tabName === this.activePanel;
    return html`
      <a
        slot="nav"
        href=${`/orgs/${this.orgId}/workflows/config/${this.workflow?.id}#${tabName}`}
        class="block font-medium rounded-sm mb-2 mr-2 p-2 transition-all ${isActive
          ? "text-blue-600 bg-blue-50 shadow-sm"
          : "text-neutral-600 hover:bg-neutral-50"}"
        @click=${() => (this.activePanel = tabName)}
        aria-selected=${isActive}
      >
        ${this.tabLabels[tabName]}
      </a>
    `;
  }

  private renderEditor = () => html`
    ${this.renderHeader(this.workflow!.id)}

    <header>
      <h2 class="text-xl font-semibold leading-10">${this.renderName()}</h2>
    </header>

    <btrix-workflow-editor
      .initialWorkflow=${this.workflow}
      jobType=${this.workflow!.jobType}
      configId=${this.workflow!.id}
      orgId=${this.orgId}
      .authState=${this.authState}
      @reset=${(e: Event) =>
        this.navTo(`/orgs/${this.orgId}/workflows/config/${this.workflow!.id}`)}
    ></btrix-workflow-editor>
  `;

  private renderMenu = () => {
    if (!this.workflow) return;
    const workflow = this.workflow;

    return html`
      <sl-dropdown placement="bottom-end" distance="4">
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            workflow.currCrawlId,
            // HACK shoelace doesn't current have a way to override non-hover
            // color without resetting the --sl-color-neutral-700 variable
            () => html`
              <sl-menu-item @click=${() => this.stop()}>
                <sl-icon name="dash-circle" slot="prefix"></sl-icon>
                ${msg("Stop Crawl")}
              </sl-menu-item>
              <sl-menu-item
                style="--sl-color-neutral-700: var(--danger)"
                @click=${() => this.cancel()}
              >
                <sl-icon name="x-octagon" slot="prefix"></sl-icon>
                ${msg("Cancel Immediately")}
              </sl-menu-item>
            `,
            () => html`
              <sl-menu-item
                style="--sl-color-neutral-700: var(--success)"
                @click=${() => this.runNow()}
              >
                <sl-icon name="play" slot="prefix"></sl-icon>
                ${msg("Run Workflow")}
              </sl-menu-item>
            `
          )}
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() =>
              this.navTo(
                `/orgs/${workflow.oid}/workflows/config/${workflow.id}?edit`
              )}
          >
            <sl-icon name="gear" slot="prefix"></sl-icon>
            ${msg("Edit Workflow Settings")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() => CopyButton.copyToClipboard(workflow.tags.join(","))}
            ?disabled=${!workflow.tags.length}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          <sl-menu-item @click=${() => this.duplicateConfig()}>
            <sl-icon name="files" slot="prefix"></sl-icon>
            ${msg("Duplicate Workflow")}
          </sl-menu-item>
          ${when(!workflow.currCrawlId, () => {
            const shouldDeactivate = workflow.crawlCount && !workflow.inactive;
            return html`
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() =>
              shouldDeactivate ? this.deactivate() : this.delete()}
          >
            <sl-icon name="trash" slot="prefix"></sl-icon>
            ${
              shouldDeactivate
                ? msg("Deactivate Workflow")
                : msg("Delete Workflow")
            }
          </sl-menu-item>
            </sl-menu>

      </sl-dropdown>
        `;
          })}
        </sl-menu></sl-dropdown
      >
    `;
  };

  private renderDetails() {
    if (!this.workflow) return;

    return html`
      <dl class="px-3 md:px-0 md:flex justify-evenly">
        ${this.renderDetailItem(
          msg("Crawl Count"),
          () => this.workflow!.crawlCount
        )}
        ${this.renderDetailItem(msg("Next Run"), () =>
          this.workflow!.schedule
            ? html`
                <div>
                  ${humanizeNextDate(this.workflow!.schedule, {
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
          () => this.workflow!.createdByName
        )}
        ${this.renderDetailItem(
          msg("Created At"),
          () => html`
            <sl-format-date
              date=${this.workflow!.created}
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

  private renderDetailItem(
    label: string | TemplateResult,
    renderContent: () => any,
    isLast = false
  ) {
    return html`
      <btrix-desc-list-item class="py-1" label=${label}>
        ${when(
          this.workflow,
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

  private renderName() {
    if (!this.workflow) return "";
    if (this.workflow.name) return this.workflow.name;
    const { config } = this.workflow;
    const firstSeed = config.seeds[0];
    let firstSeedURL = firstSeed.url;
    if (config.seeds.length === 1) {
      return firstSeedURL;
    }
    const remainderCount = config.seeds.length - 1;
    if (remainderCount === 1) {
      return msg(
        html`${firstSeedURL}
          <span class="text-neutral-500">+${remainderCount} URL</span>`
      );
    }
    return msg(
      html`${firstSeedURL}
        <span class="text-neutral-500">+${remainderCount} URLs</span>`
    );
  }

  private renderArtifacts() {
    return html`
      <section>
        <btrix-crawl-list>
          ${this.crawls.map(
            (crawl) => html`
              <btrix-crawl-list-item .crawl=${crawl}>
                <sl-menu slot="menu">
                  <sl-menu-item
                    @click=${() =>
                      this.navTo(
                        `/orgs/${this.orgId}/crawls/crawl/${crawl.id}`
                      )}
                  >
                    ${msg("View Crawl Details")}
                  </sl-menu-item>
                </sl-menu>
              </btrix-crawl-list-item>
            `
          )}
        </btrix-crawl-list>
      </section>
    `;
  }

  private renderWatchCrawl() {
    return html`TODO`;
  }

  private renderSettings() {
    return html`<section class="border rounded-lg py-3 px-5">
      <btrix-config-details
        .crawlConfig=${this.workflow}
        anchorLinks
      ></btrix-config-details>
    </section>`;
  }

  private async getWorkflow(): Promise<Workflow> {
    const data: Workflow = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs/${this.workflowId}`,
      this.authState!
    );

    return data;
  }

  private async getCrawls(): Promise<Crawl[]> {
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawls?cid=${this.workflowId}`,
      this.authState!
    );

    return data.items;
  }

  /**
   * Create a new template using existing template data
   */
  private async duplicateConfig() {
    if (!this.workflow) return;

    const workflowParams: WorkflowParams = {
      ...this.workflow,
      name: msg(str`${this.renderName()} Copy`),
    };

    this.navTo(
      `/orgs/${this.orgId}/workflows?new&jobType=${workflowParams.jobType}`,
      {
        workflow: workflowParams,
      }
    );

    this.notify({
      message: msg(str`Copied Workflow to new template.`),
      variant: "success",
      icon: "check2-circle",
    });
  }

  private async deactivate(): Promise<void> {
    if (!this.workflow) return;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.workflow = {
        ...this.workflow,
        inactive: true,
      };

      this.notify({
        message: msg(html`Deactivated <strong>${this.renderName()}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't deactivate Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async delete(): Promise<void> {
    if (!this.workflow) return;

    const isDeactivating = this.workflow.crawlCount > 0;

    try {
      await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.navTo(`/orgs/${this.orgId}/workflows`);

      this.notify({
        message: isDeactivating
          ? msg(html`Deactivated <strong>${this.renderName()}</strong>.`)
          : msg(html`Deleted <strong>${this.renderName()}</strong>.`),
        variant: "success",
        icon: "check2-circle",
      });
    } catch {
      this.notify({
        message: isDeactivating
          ? msg("Sorry, couldn't deactivate Workflow at this time.")
          : msg("Sorry, couldn't delete Workflow at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async cancel() {
    if (!this.workflow?.currCrawlId) return;
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.workflow.currCrawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.initWorkflow();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't cancel crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (!this.workflow?.currCrawlId) return;
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawls/${this.workflow.currCrawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );
      if (data.success === true) {
        this.initWorkflow();
      } else {
        this.notify({
          message: msg("Something went wrong, couldn't stop crawl."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async runNow(): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/crawlconfigs/${this.workflow!.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );
      this.initWorkflow();

      this.notify({
        message: msg(
          html`Started crawl from <strong>${this.renderName()}</strong>.
            <br />
            <a
              class="underline hover:no-underline"
              href="/orgs/${this.orgId}/crawls/crawl/${data.started}#watch"
              @click="${this.navLink.bind(this)}"
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

customElements.define("btrix-workflow-detail", WorkflowDetail);
