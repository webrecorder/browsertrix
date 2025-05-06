import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { mergeDeep } from "immutable";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import type { PartialDeep } from "type-fest";

import { ScopeType, type Seed, type WorkflowParams } from "./types";

import type { UserGuideEventMap } from "@/index";
import { headerClasses } from "@/layouts/crawl-workflows/editor";
import { pageNav, type Breadcrumb } from "@/layouts/pageHeader";
import { WorkflowScopeType } from "@/types/workflow";
import LiteElement, { html } from "@/utils/LiteElement";
import { tw } from "@/utils/tailwind";
import {
  DEFAULT_AUTOCLICK_SELECTOR,
  DEFAULT_SELECT_LINKS,
  type SECTIONS,
  type FormState as WorkflowFormState,
} from "@/utils/workflow";

enum GuideHash {
  Scope = "scope",
  Limits = "crawl-limits",
  Behaviors = "page-behavior",
  BrowserSettings = "browser-settings",
  Scheduling = "scheduling",
  Metadata = "metadata",
}

type TabName = (typeof SECTIONS)[number];

const workflowTabToGuideHash: Record<TabName, GuideHash> = {
  scope: GuideHash.Scope,
  limits: GuideHash.Limits,
  behaviors: GuideHash.Behaviors,
  browserSettings: GuideHash.BrowserSettings,
  scheduling: GuideHash.Scheduling,
  metadata: GuideHash.Metadata,
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
      <header class=${clsx(tw`items-start justify-between`, headerClasses)}>
        <h2 class="mb-6 text-xl font-semibold">${msg("New Crawl Workflow")}</h2>
        <sl-button
          size="small"
          @click=${() => {
            const userGuideHash =
              (workflowTabToGuideHash[
                window.location.hash.slice(1) as TabName
              ] as unknown as GuideHash | undefined) || GuideHash.Scope;

            this.dispatchEvent(
              new CustomEvent<
                UserGuideEventMap["btrix-user-guide-show"]["detail"]
              >("btrix-user-guide-show", {
                detail: {
                  path: `user-guide/workflow-setup/#${userGuideHash}`,
                },
                bubbles: true,
                composed: true,
              }),
            );
          }}
        >
          <sl-icon slot="prefix" name="book"></sl-icon>
          ${this.appState.userGuideOpen
            ? msg("Jump to Section")
            : msg("Open User Guide")}
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
