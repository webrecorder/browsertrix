import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { mergeDeep } from "immutable";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import type { PartialDeep } from "type-fest";

import {
  CrawlerChannelImage,
  ScopeType,
  type Seed,
  type WorkflowParams,
} from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { WorkflowScopeType, type StorageSeedFile } from "@/types/workflow";
import { tw } from "@/utils/tailwind";
import {
  DEFAULT_AUTOCLICK_SELECTOR,
  DEFAULT_SELECT_LINKS,
  makeUserGuideEvent,
  type SectionsEnum,
  type FormState as WorkflowFormState,
} from "@/utils/workflow";

/**
 * Usage:
 * ```ts
 * <btrix-workflows-new></btrix-workflows-new>
 * ```
 */
@customElement("btrix-workflows-new")
@localized()
export class WorkflowsNew extends BtrixElement {
  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: Array })
  initialSeeds?: Seed[];

  @property({ type: Object })
  initialSeedFile?: StorageSeedFile;

  @property({ type: String })
  scopeType?: WorkflowFormState["scopeType"];

  @property({ type: Object })
  initialWorkflow?: WorkflowParams;

  private get defaultNewWorkflow(): WorkflowParams {
    return {
      name: "",
      description: null,
      profileid: null,
      schedule: "",
      config: {
        scopeType: (this.appState.userPreferences?.newWorkflowScopeType ||
          WorkflowScopeType.Page) as ScopeType,
        exclude: [],
        behaviorTimeout: null,
        pageLoadTimeout: null,
        pageExtraDelay: null,
        postLoadDelay: null,
        useSitemap: false,
        failOnFailedSeed: false,
        userAgent: null,
        selectLinks: DEFAULT_SELECT_LINKS,
        customBehaviors: [],
        clickSelector: DEFAULT_AUTOCLICK_SELECTOR,
      },
      tags: [],
      crawlTimeout: null,
      maxCrawlSize: null,
      jobType: "custom",
      browserWindows: this.appState.settings?.numBrowsersPerInstance || 1,
      autoAddCollections: [],
      dedupCollId: null,
      crawlerChannel: CrawlerChannelImage.Default,
      proxyId: null,
    };
  }

  private renderBreadcrumbs() {
    const breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.navigate.orgBasePath}/workflows`,
        content: msg("Crawl Workflows"),
      },
      {
        content: msg("New Workflow"),
      },
    ];

    return pageNav(breadcrumbs);
  }

  render() {
    if (!this.isCrawler) {
      return this.renderNoAccess();
    }

    return html`
      <div class="mb-5">${this.renderBreadcrumbs()}</div>
      <header
        class="scrim scrim-to-b relative z-10 flex flex-wrap items-start justify-between gap-2 before:-top-3 lg:sticky lg:top-3"
      >
        <h2 class="mb-6 text-xl font-semibold">${msg("New Crawl Workflow")}</h2>
        <sl-button
          size="small"
          class=${clsx(
            tw`transition-opacity`,
            this.appState.userGuideOpen && tw`pointer-events-none opacity-0`,
          )}
          ?disabled=${this.appState.userGuideOpen}
          @click=${() => {
            this.dispatchEvent(
              makeUserGuideEvent(window.location.hash.slice(1) as SectionsEnum),
            );
          }}
        >
          <sl-icon slot="prefix" name="book"></sl-icon>
          ${msg("User Guide")}
        </sl-button>
      </header>
      ${when(this.org, (org) => {
        const initialWorkflow = mergeDeep(
          this.defaultNewWorkflow,
          {
            profileid: org.crawlingDefaults?.profileid,
            config: {
              exclude: org.crawlingDefaults?.exclude || [""],
              behaviorTimeout: org.crawlingDefaults?.behaviorTimeout ?? null,
              pageLoadTimeout: org.crawlingDefaults?.pageLoadTimeout ?? null,
              pageExtraDelay: org.crawlingDefaults?.pageExtraDelay ?? null,
              postLoadDelay: org.crawlingDefaults?.postLoadDelay ?? null,
              userAgent: org.crawlingDefaults?.userAgent,
              blockAds: org.crawlingDefaults?.blockAds,
              lang: org.crawlingDefaults?.lang,
              customBehaviors: org.crawlingDefaults?.customBehaviors || [],
            },
            crawlTimeout: org.crawlingDefaults?.crawlTimeout,
            maxCrawlSize: org.crawlingDefaults?.maxCrawlSize,
            crawlerChannel: org.crawlingDefaults?.crawlerChannel,
            proxyId: org.crawlingDefaults?.proxyId,
          } satisfies PartialDeep<WorkflowParams>,
          this.initialWorkflow || {},
        );

        const scopeType = this.scopeType || initialWorkflow.config.scopeType;

        return html`
          <btrix-workflow-editor
            initialScopeType=${ifDefined(
              scopeType === ScopeType.Any ? undefined : scopeType,
            )}
            .initialWorkflow=${initialWorkflow}
            .initialSeeds=${this.initialSeeds}
            .initialSeedFile=${this.initialSeedFile}
          ></btrix-workflow-editor>
        `;
      })}
    `;
  }

  private readonly renderNoAccess = () => html`
    <btrix-alert variant="danger">
      ${msg(`You don't have permission to create a new Workflow.`)}
    </btrix-alert>
  `;
}
