import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import RegexColorize from "regex-colorize";
import ISO6391 from "iso-639-1";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import type { CrawlConfig, Seed, SeedConfig } from "../pages/org/types";
import type { Collection, CollectionList } from "../types/collection";
import { humanizeSchedule } from "../utils/cron";
import { RelativeDuration } from "./relative-duration";

/**
 * Usage:
 * ```ts
 * <btrix-config-details
 *   .authState=${this.authState!}
 *   .crawlConfig=${this.crawlConfig}
 * ></btrix-config-details>
 * ```
 */
@localized()
export class ConfigDetails extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: Object })
  crawlConfig?: CrawlConfig;

  @property({ type: Boolean })
  anchorLinks = false;

  // Hide tag field, e.g. if embedded in crawl detail view
  @property({ type: Boolean })
  hideTags = false;

  @state()
  private orgDefaults?: {
    pageLoadTimeoutSeconds?: number;
    behaviorTimeoutSeconds?: number;
    maxPagesPerCrawl?: number;
  };

  @state()
  private collections: CollectionList = [];

  private readonly scopeTypeLabels: Record<
    CrawlConfig["config"]["scopeType"],
    string
  > = {
    prefix: msg("Path Begins with This URL"),
    host: msg("Pages on This Domain"),
    domain: msg("Pages on This Domain & Subdomains"),
    "page-spa": msg("Single Page App (In-Page Links Only)"),
    page: msg("Page"),
    custom: msg("Custom"),
    any: msg("Any"),
  };

  async connectedCallback() {
    super.connectedCallback();
    this.fetchAPIDefaults();
    await this.fetchCollections();
  }

  render() {
    const crawlConfig = this.crawlConfig;
    const seedsConfig = crawlConfig?.config;
    const exclusions = seedsConfig?.exclude || [];
    const maxPages = seedsConfig?.seeds[0]?.limit ?? seedsConfig?.limit;
    const renderTimeLimit = (
      valueSeconds?: number | null,
      fallbackValue?: number
    ) => {
      if (valueSeconds) {
        return RelativeDuration.humanize(valueSeconds * 1000, {
          verbose: true,
        });
      }
      if (typeof fallbackValue === "number") {
        let value = "";
        if (fallbackValue === Infinity) {
          value = msg("Unlimited");
        } else if (fallbackValue === 0) {
          value = msg("0 seconds");
        } else {
          value = RelativeDuration.humanize(fallbackValue * 1000, {
            verbose: true,
          });
        }
        return html`<span class="text-neutral-400"
          >${value} ${msg("(default)")}</span
        >`;
      }
    };

    return html`
      <section id="crawler-settings" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${msg("Crawler Settings")}</h4>
          ${this.renderAnchorLink("crawler-settings")}
        </btrix-section-heading>
        <btrix-desc-list>
          ${when(
            crawlConfig?.jobType === "seed-crawl",
            this.renderConfirmSeededSettings,
            this.renderConfirmUrlListSettings
          )}
          ${when(
            exclusions.length,
            () => html`
              <div class="mb-2">
                <btrix-queue-exclusion-table
                  .exclusions=${exclusions}
                  labelClassName="text-xs text-neutral-500"
                >
                </btrix-queue-exclusion-table>
              </div>
            `,
            () => this.renderSetting(msg("Exclusions"), msg("None"))
          )}
          ${this.renderSetting(
            msg("Max Pages"),
            when(
              maxPages,
              () => msg(str`${maxPages!.toLocaleString()} pages`),
              () =>
                this.orgDefaults?.maxPagesPerCrawl
                  ? html`<span class="text-neutral-400"
                      >${msg(
                        str`${this.orgDefaults.maxPagesPerCrawl.toLocaleString()} pages`
                      )}
                      ${msg("(default)")}</span
                    >`
                  : undefined
            )
          )}
          ${this.renderSetting(
            msg("Page Load Timeout"),
            renderTimeLimit(
              crawlConfig?.config.pageLoadTimeout,
              this.orgDefaults?.pageLoadTimeoutSeconds ?? Infinity
            )
          )}
          ${this.renderSetting(
            msg("Page Behavior Timeout"),
            renderTimeLimit(
              crawlConfig?.config.behaviorTimeout,
              this.orgDefaults?.behaviorTimeoutSeconds ?? Infinity
            )
          )}
          ${this.renderSetting(
            msg("Auto-Scroll Behavior"),
            crawlConfig?.config.behaviors &&
              !crawlConfig.config.behaviors.includes("autoscroll")
              ? msg("Disabled")
              : html`<span class="text-neutral-400"
                  >${msg("Enabled (default)")}</span
                >`
          )}
          ${this.renderSetting(
            msg("Delay Before Next Page"),
            renderTimeLimit(crawlConfig?.config.pageExtraDelay, 0)
          )}
          ${this.renderSetting(
            msg("Crawl Time Limit"),
            renderTimeLimit(crawlConfig?.crawlTimeout, Infinity)
          )}
          ${this.renderSetting(msg("Crawler Instances"), crawlConfig?.scale)}
        </btrix-desc-list>
      </section>
      <section id="browser-settings" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${msg("Browser Settings")}</h4>
          ${this.renderAnchorLink("browser-settings")}
        </btrix-section-heading>
        <btrix-desc-list>
          ${this.renderSetting(
            msg("Browser Profile"),
            when(
              crawlConfig?.profileid,
              () => html`<a
                class="text-blue-500 hover:text-blue-600"
                href=${`/orgs/${crawlConfig!.oid}/browser-profiles/profile/${
                  crawlConfig!.profileid
                }`}
                @click=${this.navLink}
              >
                ${crawlConfig?.profileName}
              </a>`,
              () => msg("Default Profile")
            )
          )}
          ${this.renderSetting(
            msg("Block Ads by Domain"),
            crawlConfig?.config.blockAds
          )}
          ${this.renderSetting(
            msg("Language"),
            ISO6391.getName(crawlConfig?.config.lang!)
          )}
        </btrix-desc-list>
      </section>
      <section id="crawl-scheduling" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${msg("Crawl Scheduling")}</h4>
          ${this.renderAnchorLink("crawl-scheduling")}
        </btrix-section-heading>
        <btrix-desc-list>
          ${this.renderSetting(
            msg("Crawl Schedule Type"),
            crawlConfig?.schedule
              ? msg("Run on a Recurring Basis")
              : msg("No Schedule")
          )}
          ${when(crawlConfig?.schedule, () =>
            this.renderSetting(
              msg("Schedule"),
              crawlConfig?.schedule
                ? humanizeSchedule(crawlConfig.schedule)
                : undefined
            )
          )}
        </btrix-desc-list>
      </section>
      <section id="crawl-metadata" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${msg("Crawl Metadata")}</h4>
          ${this.renderAnchorLink("crawl-metadata")}
        </btrix-section-heading>
        <btrix-desc-list>
          ${this.renderSetting(msg("Name"), crawlConfig?.name)}
          ${this.renderSetting(
            msg("Description"),
            html`
              <p class="font-sans max-w-prose">${crawlConfig?.description}</p>
            `
          )}
          ${this.hideTags
            ? ""
            : this.renderSetting(
                msg("Tags"),
                crawlConfig?.tags?.length
                  ? crawlConfig.tags.map(
                      (tag) =>
                        html`<btrix-tag class="mt-1 mr-2">${tag}</btrix-tag>`
                    )
                  : undefined
              )}
          ${this.renderSetting(
            msg("Collections"),
            this.collections.length
              ? this.collections.map(
                  (coll) =>
                    html`<sl-tag class="mt-1 mr-2" variant="neutral">
                      ${coll.name}
                      <span class="pl-1 font-monostyle text-xs">
                        (${msg(str`${coll.crawlCount} Crawls`)})
                      </span>
                    </sl-tag>`
                )
              : undefined
          )}
        </btrix-desc-list>
      </section>
    `;
  }

  private renderConfirmUrlListSettings = () => {
    const crawlConfig = this.crawlConfig;
    return html`
      ${this.renderSetting(
        msg("List of URLs"),
        html`
          <ul>
            ${crawlConfig?.config.seeds.map(
              (seed: Seed) => html` <li>${seed.url}</li> `
            )}
          </ul>
        `,
        true
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page"),
        Boolean(crawlConfig?.config.extraHops)
      )}
    `;
  };

  private renderConfirmSeededSettings = () => {
    const crawlConfig = this.crawlConfig!;
    const seedsConfig = crawlConfig.config;
    const additionalUrlList = seedsConfig.seeds.slice(1);
    const primarySeedConfig: SeedConfig | Seed = seedsConfig.seeds[0];
    const primarySeedUrl = primarySeedConfig.url;
    const includeUrlList =
      primarySeedConfig.include || seedsConfig.include || [];
    return html`
      ${this.renderSetting(msg("Primary Seed URL"), primarySeedUrl, true)}
      ${this.renderSetting(
        msg("Crawl Scope"),
        this.scopeTypeLabels[
          primarySeedConfig.scopeType || seedsConfig.scopeType
        ]
      )}
      ${this.renderSetting(
        msg("Extra URLs in Scope"),
        includeUrlList?.length
          ? html`
              <ul>
                ${includeUrlList.map(
                  (url: string) =>
                    staticHtml`<li class="regex">${unsafeStatic(
                      new RegexColorize().colorizeText(url)
                    )}</li>`
                )}
              </ul>
            `
          : msg("None"),
        true
      )}
      ${when(
        ["host", "domain", "custom", "any"].includes(
          primarySeedConfig.scopeType || seedsConfig.scopeType
        ),
        () =>
          this.renderSetting(
            msg("Max Depth"),
            primarySeedConfig.depth
              ? msg(str`${primarySeedConfig.depth} hop(s)`)
              : msg("None")
          )
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(primarySeedConfig.extraHops ?? seedsConfig.extraHops)
      )}
      ${this.renderSetting(
        msg("Check For Sitemap"),
        Boolean(seedsConfig.useSitemap)
      )}
      ${this.renderSetting(
        msg("List of Additional URLs"),
        additionalUrlList?.length
          ? html`
              <ul>
                ${additionalUrlList.map(
                  (seed) =>
                    html`<li>${typeof seed === "string" ? seed : seed.url}</li>`
                )}
              </ul>
            `
          : msg("None"),
        true
      )}
    `;
  };

  private renderAnchorLink(id: string) {
    if (!this.anchorLinks) return;
    const currentUrl = window.location.href;
    return html`
      <btrix-copy-button
        style="font-size: 1rem;"
        value=${`${currentUrl.replace(window.location.hash, "")}#${id}`}
        name="link-45deg"
        content=${msg("Copy Link to Section")}
      ></btrix-copy-button>
    `;
  }

  private renderSetting(label: string, value: any, breakAll?: boolean) {
    let content = value;

    if (!this.crawlConfig) {
      content = html` <sl-skeleton></sl-skeleton> `;
    } else if (typeof value === "boolean") {
      content = value ? msg("Yes") : msg("No");
    } else if (typeof value !== "number" && !value) {
      content = html`<span class="text-neutral-400"
        >${msg("Not specified")}</span
      >`;
    }
    return html`
      <btrix-desc-list-item label=${label} class=${breakAll ? "break-all" : ""}>
        ${content}
      </btrix-desc-list-item>
    `;
  }

  private async fetchCollections() {
    if (this.crawlConfig?.autoAddCollections) {
      try {
        await this.getCollections();
      } catch (e: any) {
        this.notify({
          message:
            e.statusCode === 404
              ? msg("Collections not found.")
              : msg(
                  "Sorry, couldn't retrieve Collection details at this time."
                ),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async getCollections() {
    let collections: CollectionList = [];
    const orgId = this.crawlConfig?.oid;

    if (this.crawlConfig?.autoAddCollections && orgId) {
      for (let i = 0; i < this.crawlConfig.autoAddCollections.length; i++) {
        const collectionId = this.crawlConfig.autoAddCollections[i];
        const data: Collection = await this.apiFetch(
          `/orgs/${orgId}/collections/${collectionId}`,
          this.authState!
        );
        if (data) {
          collections.push(data);
        }
      }
    }
    this.collections = collections;
    this.requestUpdate();
  }

  private async fetchAPIDefaults() {
    try {
      const resp = await fetch("/api/settings", {
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        throw new Error(resp.statusText);
      }
      const orgDefaults = {
        ...this.orgDefaults,
      };
      const data = await resp.json();
      if (data.defaultBehaviorTimeSeconds > 0) {
        orgDefaults.behaviorTimeoutSeconds = data.defaultBehaviorTimeSeconds;
      }
      if (data.defaultPageLoadTimeSeconds > 0) {
        orgDefaults.pageLoadTimeoutSeconds = data.defaultPageLoadTimeSeconds;
      }
      if (data.maxPagesPerCrawl > 0) {
        orgDefaults.maxPagesPerCrawl = data.maxPagesPerCrawl;
      }
      this.orgDefaults = orgDefaults;
    } catch (e: any) {
      console.debug(e);
    }
  }
}
