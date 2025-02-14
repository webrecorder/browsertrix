import { localized, msg } from "@lit/localize";
import { mergeDeep } from "immutable";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { ScopeType, type Seed, type WorkflowParams } from "./types";

import type { UserGuideEventMap } from "@/index";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { WorkflowScopeType } from "@/types/workflow";
import LiteElement, { html } from "@/utils/LiteElement";
import type { FormState as WorkflowFormState } from "@/utils/workflow";

type GuideHash =
  | "scope"
  | "limits"
  | "browser-settings"
  | "scheduling"
  | "metadata"
  | "review-settings";

const workflowTabToGuideHash: Record<string, GuideHash> = {
  crawlSetup: "scope",
  crawlLimits: "limits",
  browserSettings: "browser-settings",
  crawlScheduling: "scheduling",
  crawlMetadata: "metadata",
  confirmSettings: "review-settings",
};

/**
 * Usage:
 * ```ts
 * <btrix-workflows-new></btrix-workflows-new>
 * ```
 */
@customElement("btrix-workflows-new")
@localized()
export class WorkflowsNew extends LiteElement {
  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: Array })
  initialSeeds?: Seed[];

  @property({ type: String })
  scopeType?: WorkflowFormState["scopeType"];

  @property({ type: Object })
  initialWorkflow?: WorkflowParams;

  private userGuideHashLink: GuideHash = "scope";

  connectedCallback(): void {
    super.connectedCallback();

    this.userGuideHashLink =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      workflowTabToGuideHash[window.location.hash.slice(1) as GuideHash] ||
      "scope";

    window.addEventListener("hashchange", () => {
      const hashValue = window.location.hash.slice(1) as GuideHash;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      this.userGuideHashLink = workflowTabToGuideHash[hashValue] || "scope";
    });
  }

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
        selectLinks: ["a[href]->href"],
      },
      tags: [],
      crawlTimeout: null,
      maxCrawlSize: null,
      jobType: "custom",
      scale: 1,
      autoAddCollections: [],
      crawlerChannel: "default",
      proxyId: null,
    };
  }

  private renderBreadcrumbs() {
    const breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.orgBasePath}/workflows`,
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
      <header class="flex items-center justify-between">
        <h2 class="mb-6 text-xl font-semibold">${msg("New Crawl Workflow")}</h2>
        <sl-button
          size="small"
          @click=${() => {
            this.dispatchEvent(
              new CustomEvent<
                UserGuideEventMap["btrix-user-guide-show"]["detail"]
              >("btrix-user-guide-show", {
                detail: {
                  path: `user-guide/workflow-setup/#${this.userGuideHashLink}`,
                },
                bubbles: true,
                composed: true,
              }),
            );
          }}
        >
          <sl-icon slot="prefix" name="book"></sl-icon>
          ${msg("Setup Guide")}
        </sl-button>
      </header>
      ${when(this.org, (org) => {
        const initialWorkflow = mergeDeep(
          this.defaultNewWorkflow,
          {
            profileid: org.crawlingDefaults?.profileid,
            config: {
              exclude: org.crawlingDefaults?.exclude || [""],
              behaviorTimeout: org.crawlingDefaults?.behaviorTimeout,
              pageLoadTimeout: org.crawlingDefaults?.pageLoadTimeout,
              pageExtraDelay: org.crawlingDefaults?.pageExtraDelay,
              postLoadDelay: org.crawlingDefaults?.postLoadDelay,
              userAgent: org.crawlingDefaults?.userAgent,
              blockAds: org.crawlingDefaults?.blockAds,
              lang: org.crawlingDefaults?.lang,
            },
            crawlTimeout: org.crawlingDefaults?.crawlTimeout,
            maxCrawlSize: org.crawlingDefaults?.maxCrawlSize,
            crawlerChannel: org.crawlingDefaults?.crawlerChannel,
            proxyId: org.crawlingDefaults?.proxyId,
          },
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
