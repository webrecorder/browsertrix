import type { TemplateResult, LitElement } from "lit";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import { mergeDeep } from "immutable";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { JobType, WorkflowParams } from "./types";
import "./workflow-editor";
import seededCrawlSvg from "../../assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-crawl-config_URL-List.svg";

const defaultValue = {
  name: "",
  description: null,
  profileid: null,
  schedule: "",
  config: {
    seeds: [],
    scopeType: "prefix",
    exclude: [""],
    behaviorTimeout: null,
    pageLoadTimeout: null,
    pageExtraDelay: null,
    useSitemap: false,
  },
  tags: [],
  crawlTimeout: null,
  jobType: undefined,
  scale: 1,
  autoAddCollections: [],
} as WorkflowParams;

/**
 * Usage:
 * ```ts
 * <btrix-workflows-new></btrix-workflows-new>
 * ```
 */
@localized()
export class WorkflowsNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler!: boolean;

  // Use custom property accessor to prevent
  // overriding default Workflow values
  @property({ type: Object })
  get initialWorkflow(): WorkflowParams {
    return this._initialWorkflow;
  }
  private _initialWorkflow: WorkflowParams = defaultValue;
  set initialWorkflow(val: Partial<WorkflowParams>) {
    this._initialWorkflow = mergeDeep(this._initialWorkflow, val);
  }

  @state()
  private jobType?: JobType;

  connectedCallback() {
    super.connectedCallback();
    if (!this.jobType) {
      const url = new URL(window.location.href);
      this.jobType = (url.searchParams.get("jobType") as JobType) || undefined;
    }
  }

  private renderHeader() {
    let href = `/orgs/${this.orgId}/workflows/crawls`;
    let label = msg("Back to Crawl Workflows");

    // Allow user to go back to choose crawl type if new (not duplicated) config
    if (this.jobType && !this.initialWorkflow.jobType) {
      href = `/orgs/${this.orgId}/workflows?new`;
      label = msg("Choose Crawl Type");
    }
    return html`
      <nav class="mb-5">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${href}
          @click=${(e: any) => {
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

    const jobType = this.initialWorkflow.jobType || this.jobType;

    if (this.isCrawler && jobType) {
      return html`
        ${this.renderHeader()}
        <h2 class="text-xl font-semibold mb-6">
          ${msg(html`New Crawl Workflow &mdash; ${jobTypeLabels[jobType]}`)}
        </h2>
        <btrix-workflow-editor
          .initialWorkflow=${this.initialWorkflow}
          jobType=${jobType}
          orgId=${this.orgId}
          .authState=${this.authState}
          @reset=${async (e: Event) => {
            await (e.target as LitElement).updateComplete;
            this.jobType = undefined;
          }}
        ></btrix-workflow-editor>
      `;
    }

    return html`
      ${this.renderHeader()}
      <h2 class="text-xl font-semibold mb-6">${msg("New Crawl Workflow")}</h2>
      ${when(this.isCrawler, this.renderChooseJobType, this.renderNoAccess)}
    `;
  }

  private renderChooseJobType = () => {
    return html`
      <style>
        .jobTypeButton:hover img {
          transform: scale(1.05);
        }
      </style>
      <h3 class="text-lg font-semibold mb-3">${msg("Choose Crawl Type")}</h3>
      <div
        class="border rounded p-8 md:py-12 flex flex-col md:flex-row items-start justify-evenly"
      >
        <a
          role="button"
          class="jobTypeButton"
          href=${`/orgs/${this.orgId}/workflows?new&jobType=url-list`}
          @click=${(e: any) => {
            this.navLink(e);
            this.jobType = "url-list";
          }}
        >
          <figure class="w-64 m-4">
            <img class="transition-transform" src=${urlListSvg} />
            <figcaption>
              <div class="text-lg font-medium my-3">${msg("URL List")}</div>
              <p class="text-sm text-neutral-500">
                ${msg(
                  "The crawler visits every URL specified in a list, and optionally every URL linked on those pages."
                )}
              </p>
            </figcaption>
          </figure>
        </a>
        <a
          role="button"
          class="jobTypeButton"
          href=${`/orgs/${this.orgId}/workflows?new&jobType=seed-crawl`}
          @click=${(e: any) => {
            this.navLink(e);
            this.jobType = "seed-crawl";
          }}
        >
          <figure class="w-64 m-4">
            <img class="transition-transform" src=${seededCrawlSvg} />
            <figcaption>
              <div class="text-lg font-medium my-3">${msg("Seeded Crawl")}</div>
              <p class="text-sm text-neutral-500">
                ${msg(
                  "The crawler automatically discovers and archives pages starting from a single seed URL."
                )}
              </p>
            </figcaption>
          </figure>
        </a>
      </div>
    `;
  };

  private renderNoAccess = () => html`
    <btrix-alert variant="danger">
      ${msg(`You don't have permission to create a new Workflow.`)}
    </btrix-alert>
  `;
}

customElements.define("btrix-workflows-new", WorkflowsNew);
