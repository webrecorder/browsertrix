import type { TemplateResult, LitElement } from "lit";
import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { mergeDeep } from "immutable";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { JobType, InitialCrawlConfig } from "./types";
import "./crawl-config-editor";
import seededCrawlSvg from "../../assets/images/new-crawl-config_Seeded-Crawl.svg";
import urlListSvg from "../../assets/images/new-crawl-config_URL-List.svg";

const defaultValue = {
  name: "",
  profileid: null,
  schedule: "",
  config: {
    seeds: [],
    scopeType: "prefix",
    exclude: [""],
  },
} as InitialCrawlConfig;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-new></btrix-crawl-templates-new>
 * ```
 */
@localized()
export class CrawlTemplatesNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  // Use custom property accessor to prevent
  // overriding default crawl config values
  @property({ type: Object })
  get initialCrawlTemplate(): InitialCrawlConfig {
    return this._initialCrawlTemplate;
  }
  private _initialCrawlTemplate: InitialCrawlConfig = defaultValue;
  set initialCrawlTemplate(val: Partial<InitialCrawlConfig>) {
    this._initialCrawlTemplate = mergeDeep(this._initialCrawlTemplate, val);
  }

  @state()
  private jobType?: JobType;

  private renderHeader() {
    return html`
      <nav class="mb-5">
        <a
          class="text-gray-600 hover:text-gray-800 text-sm font-medium"
          href=${`/orgs/${this.orgId}/crawl-templates`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Crawl Configs")}</span
          >
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

    const jobType = this.initialCrawlTemplate.jobType || this.jobType;

    if (jobType) {
      return html`
        ${this.renderHeader()}
        <h2 class="text-xl font-medium mb-6">
          ${msg(html`New Crawl Config &mdash; ${jobTypeLabels[jobType]}`)}
        </h2>
        <btrix-crawl-config-editor
          .initialCrawlConfig=${this.initialCrawlTemplate}
          jobType=${jobType}
          orgId=${this.orgId}
          .authState=${this.authState}
          @reset=${async (e: Event) => {
            await (e.target as LitElement).updateComplete;
            this.jobType = undefined;
          }}
        ></btrix-crawl-config-editor>
      `;
    }

    return html`
      ${this.renderHeader()}
      <h2 class="text-xl font-medium mb-6">${msg("New Crawl Config")}</h2>
      ${this.renderChooseJobType()}
    `;
  }

  private renderChooseJobType() {
    return html`
      <style>
        .jobTypeButton:hover img {
          transform: scale(1.05);
        }
      </style>
      <h3 class="text-lg font-medium mb-3">${msg("Choose Crawl Type")}</h3>
      <div
        class="border rounded p-8 md:py-12 flex flex-col md:flex-row items-start justify-evenly"
      >
        <div
          role="button"
          class="jobTypeButton"
          @click=${() => (this.jobType = "url-list")}
        >
          <figure class="w-64 m-4">
            <img class="transition-transform" src=${urlListSvg} />
            <figcaption>
              <div class="text-lg font-medium my-3">${msg("URL List")}</div>
              <p class="text-sm text-neutral-500">
                ${msg(
                  "The crawler visits every URL you tell it to and optionally every URL linked on those pages."
                )}
              </p>
            </figcaption>
          </figure>
        </div>
        <div
          role="button"
          class="jobTypeButton"
          @click=${() => (this.jobType = "seed-crawl")}
        >
          <figure class="w-64 m-4">
            <img class="transition-transform" src=${seededCrawlSvg} />
            <figcaption>
              <div class="text-lg font-medium my-3">${msg("Seeded Crawl")}</div>
              <p class="text-sm text-neutral-500">
                ${msg(
                  "The crawler automatically finds new pages and archives them."
                )}
              </p>
            </figcaption>
          </figure>
        </div>
      </div>
    `;
  }
}

customElements.define("btrix-crawl-templates-new", CrawlTemplatesNew);
