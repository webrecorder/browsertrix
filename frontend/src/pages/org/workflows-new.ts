import { localized, msg } from "@lit/localize";
import { mergeDeep } from "immutable";
import type { LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import type { JobType, Seed, WorkflowParams } from "./types";

import type { SelectNewDialogEvent } from ".";

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

  private renderHeader() {
    const breadcrumbs = [
      html`<sl-breadcrumb-item
        href="${this.orgBasePath}/workflows"
        @click=${this.navLink}
      >
        ${msg("Crawl Workflows")}
      </sl-breadcrumb-item>`,
      html`<sl-breadcrumb-item
        href="${this.orgBasePath}/workflows?new=workflow"
        @click=${this.navLink}
      >
        ${msg("New Workflow")}
      </sl-breadcrumb-item>`,
    ];

    const jobType = this.initialWorkflow.jobType || this.jobType;

    if (jobType) {
      breadcrumbs.push(
        html`<sl-breadcrumb-item>
          ${this.jobTypeLabels[jobType]}
        </sl-breadcrumb-item>`,
      );
    }

    return html`
      <sl-breadcrumb> ${breadcrumbs.map((bc) => bc)} </sl-breadcrumb>
    `;
  }

  render() {
    const jobType = this.initialWorkflow?.jobType || this.jobType;

    if (!this.isCrawler) {
      return this.renderNoAccess();
    }

    if (jobType) {
      return html`
        <div class="mb-5">${this.renderHeader()}</div>
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
