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

  private renderHeader() {
    const href = `${this.orgBasePath}/workflows/crawls`;
    const label = msg("Back to Crawl Workflows");

    return html`
      <nav class="mb-5">
        <a
          class="text-sm font-medium text-gray-600 hover:text-gray-800"
          href=${href}
          @click=${(e: MouseEvent) => {
            this.navLink(e);
            this.jobType = undefined;
          }}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle">${label}</span>
        </a>
      </nav>
    `;
  }

  render() {
    const jobTypeLabels: Record<JobType, string> = {
      "url-list": msg("URL List"),
      "seed-crawl": msg("Seeded Crawl"),
      custom: msg("Custom"),
    };

    const jobType = this.initialWorkflow?.jobType || this.jobType;

    if (!this.isCrawler) {
      return this.renderNoAccess();
    }

    if (jobType) {
      return html`
        ${this.renderHeader()}
        <h2 class="mb-6 text-xl font-semibold">
          ${msg(html`New Crawl Workflow &mdash; ${jobTypeLabels[jobType]}`)}
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
              // crawlTimeout: null,
              // maxCrawlSize: null,
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
