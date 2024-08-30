import { localized, msg } from "@lit/localize";
import { mergeDeep } from "immutable";
import type { LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { JobType, Seed, WorkflowParams } from "./types";

import type { SelectNewDialogEvent } from ".";

import { pageBreadcrumbs, type Breadcrumb } from "@/layouts/pageHeader";
import LiteElement, { html } from "@/utils/LiteElement";

const defaultValue = {
  name: "",
  description: null,
  profileid: null,
  schedule: "",
  config: {
    seeds: [],
    scopeType: "prefix",
    exclude: [],
    behaviorTimeout: null,
    pageLoadTimeout: null,
    pageExtraDelay: null,
    postLoadDelay: null,
    useSitemap: false,
    failOnFailedSeed: false,
    userAgent: null,
  },
  tags: [],
  crawlTimeout: null,
  maxCrawlSize: null,
  jobType: undefined,
  scale: 1,
  autoAddCollections: [],
  crawlerChannel: "default",
} as WorkflowParams;

/**
 * Usage:
 * ```ts
 * <btrix-workflows-new></btrix-workflows-new>
 * ```
 */
@localized()
@customElement("btrix-workflows-new")
export class WorkflowsNew extends LiteElement {
  @property({ type: Boolean })
  isCrawler!: boolean;

  @property({ type: Array })
  initialSeeds?: Seed[];

  @property({ type: String })
  jobType?: JobType;

  @property({ type: Object })
  initialWorkflow?: WorkflowParams;

  private readonly jobTypeLabels: Record<JobType, string> = {
    "url-list": msg("URL List"),
    "seed-crawl": msg("Seeded Crawl"),
    custom: msg("Custom"),
  };

  private renderBreadcrumbs() {
    const breadcrumbs: Breadcrumb[] = [
      {
        href: `${this.orgBasePath}/workflows`,
        content: msg("Crawl Workflows"),
      },
      {
        href: `${this.orgBasePath}/workflows?new=workflow`,
        content: msg("New Workflow"),
      },
    ];

    const jobType = this.initialWorkflow?.jobType || this.jobType;

    if (jobType) {
      breadcrumbs.push({
        content: this.jobTypeLabels[jobType],
      });
    }

    return pageBreadcrumbs(breadcrumbs);
  }

  render() {
    const jobType = this.initialWorkflow?.jobType || this.jobType;

    if (!this.isCrawler) {
      return this.renderNoAccess();
    }

    if (jobType) {
      return html`
        <div class="mb-5">${this.renderBreadcrumbs()}</div>
        <h2 class="mb-6 text-xl font-semibold">
          ${msg("New")} ${this.jobTypeLabels[jobType]}
        </h2>
        ${when(this.org, (org) => {
          const initialWorkflow = mergeDeep(
            defaultValue,
            {
              profileid: org.crawlingDefaults?.profileid,
              config: {
                exclude: org.crawlingDefaults?.exclude,
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
            },
            this.initialWorkflow || {},
          );

          return html`
            <btrix-workflow-editor
              .initialWorkflow=${initialWorkflow}
              .initialSeeds=${this.initialSeeds}
              jobType=${jobType}
              @reset=${async (e: Event) => {
                await (e.target as LitElement).updateComplete;
                this.dispatchEvent(
                  new CustomEvent("select-new-dialog", {
                    detail: "workflow",
                  }) as SelectNewDialogEvent,
                );
              }}
            ></btrix-workflow-editor>
          `;
        })}
      `;
    }

    return html``;
  }

  private readonly renderNoAccess = () => html`
    <btrix-alert variant="danger">
      ${msg(`You don't have permission to create a new Workflow.`)}
    </btrix-alert>
  `;
}
