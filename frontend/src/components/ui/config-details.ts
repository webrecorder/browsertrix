import { localized, msg, str } from "@lit/localize";
import ISO6391 from "iso-639-1";
import { nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import capitalize from "lodash/fp/capitalize";
import RegexColorize from "regex-colorize";

import { RelativeDuration } from "./relative-duration";

import type { CrawlConfig, Seed, SeedConfig } from "@/pages/org/types";
import scopeTypeLabel from "@/strings/crawl-workflows/scopeType";
import sectionStrings from "@/strings/crawl-workflows/section";
import type { Collection } from "@/types/collection";
import { isApiError } from "@/utils/api";
import { getAppSettings } from "@/utils/app";
import { DEPTH_SUPPORTED_SCOPES } from "@/utils/crawler";
import { humanizeSchedule } from "@/utils/cron";
import LiteElement, { html } from "@/utils/LiteElement";
import { formatNumber } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";

/**
 * Usage:
 * ```ts
 * <btrix-config-details
 *   .crawlConfig=${this.crawlConfig}
 * ></btrix-config-details>
 * ```
 */
@localized()
@customElement("btrix-config-details")
export class ConfigDetails extends LiteElement {
  @property({ type: Object })
  crawlConfig?: CrawlConfig;

  @property({ type: Array })
  seeds?: Seed[];

  @property({ type: Boolean })
  anchorLinks = false;

  // Hide metadata section, e.g. if embedded in crawl detail view
  @property({ type: Boolean })
  hideMetadata = false;

  @state()
  private orgDefaults?: {
    pageLoadTimeoutSeconds?: number;
    behaviorTimeoutSeconds?: number;
    maxPagesPerCrawl?: number;
  };

  @state()
  private collections: Collection[] = [];

  async connectedCallback() {
    super.connectedCallback();
    void this.fetchAPIDefaults();
    await this.fetchCollections();
  }

  render() {
    const crawlConfig = this.crawlConfig;
    const seedsConfig = crawlConfig?.config;
    const exclusions = seedsConfig?.exclude || [];
    const maxPages = this.seeds?.[0]?.limit ?? seedsConfig?.limit;
    const renderTimeLimit = (
      valueSeconds?: number | null,
      fallbackValue?: number,
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
    const renderSize = (valueBytes?: number | null) => {
      // Eventually we will want to set this to the selected locale
      if (valueBytes) {
        return html`<sl-format-bytes
          value=${valueBytes}
          display="narrow"
        ></sl-format-bytes>`;
      }

      return html`<span class="text-neutral-400"
        >${msg("Unlimited")} ${msg("(default)")}</span
      >`;
    };

    return html`
      <section id="crawler-settings" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${sectionStrings.scope}</h4>
        </btrix-section-heading>
        <btrix-desc-list>
          ${when(
            crawlConfig?.config.scopeType === "page",
            this.renderConfirmUrlListSettings,
            this.renderConfirmSeededSettings,
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
            () => this.renderSetting(msg("Exclusions"), msg("None")),
          )}
          <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
            <h4>${sectionStrings.perCrawlLimits}</h4>
          </btrix-section-heading>
          ${this.renderSetting(
            msg("Max Pages"),
            when(
              maxPages,
              (val: number | string) =>
                `${formatNumber(+val)} ${pluralOf("pages", +val)}`,
              () =>
                this.orgDefaults?.maxPagesPerCrawl
                  ? html`<span class="text-neutral-400">
                      ${formatNumber(this.orgDefaults.maxPagesPerCrawl)}
                      ${pluralOf("pages", this.orgDefaults.maxPagesPerCrawl)}
                      ${msg("(default)")}</span
                    >`
                  : undefined,
            ),
          )}
          ${this.renderSetting(
            msg("Crawl Time Limit"),
            renderTimeLimit(crawlConfig?.crawlTimeout, Infinity),
          )}
          ${this.renderSetting(
            msg("Crawl Size Limit"),
            renderSize(crawlConfig?.maxCrawlSize),
          )}
          <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
            <h4>${sectionStrings.perPageLimits}</h4>
          </btrix-section-heading>
          ${this.renderSetting(
            msg("Page Load Timeout"),
            renderTimeLimit(
              crawlConfig?.config.pageLoadTimeout,
              this.orgDefaults?.pageLoadTimeoutSeconds ?? Infinity,
            ),
          )}
          ${this.renderSetting(
            msg("Delay After Page Load"),
            renderTimeLimit(crawlConfig?.config.postLoadDelay, 0),
          )}
          ${this.renderSetting(
            msg("Behavior Timeout"),
            renderTimeLimit(
              crawlConfig?.config.behaviorTimeout,
              this.orgDefaults?.behaviorTimeoutSeconds ?? Infinity,
            ),
          )}
          ${this.renderSetting(
            msg("Auto-Scroll Behavior"),
            crawlConfig?.config.behaviors &&
              !crawlConfig.config.behaviors.includes("autoscroll")
              ? msg("Disabled")
              : html`<span class="text-neutral-400"
                  >${msg("Enabled (default)")}</span
                >`,
          )}
          ${this.renderSetting(
            msg("Delay Before Next Page"),
            renderTimeLimit(crawlConfig?.config.pageExtraDelay, 0),
          )}
        </btrix-desc-list>
      </section>
      <section id="browser-settings" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${sectionStrings.browserSettings}</h4>
        </btrix-section-heading>
        <btrix-desc-list>
          ${this.renderSetting(
            msg("Browser Profile"),
            when(
              crawlConfig?.profileid,
              () =>
                html`<a
                  class="text-blue-500 hover:text-blue-600"
                  href=${`/orgs/${crawlConfig!.oid}/browser-profiles/profile/${
                    crawlConfig!.profileid
                  }`}
                  @click=${this.navLink}
                >
                  ${crawlConfig?.profileName}
                </a>`,
              () =>
                crawlConfig?.profileName ||
                html`<span class="text-neutral-400"
                  >${msg("No custom profile")}</span
                >`,
            ),
          )}
          ${this.renderSetting(
            msg("Browser Windows"),
            crawlConfig?.scale && this.appState.settings
              ? `${crawlConfig.scale * this.appState.settings.numBrowsers}`
              : "",
          )}
          ${this.renderSetting(
            msg("Crawler Channel (Exact Crawler Version)"),
            capitalize(crawlConfig?.crawlerChannel || "default") +
              (crawlConfig?.image ? ` (${crawlConfig.image})` : ""),
          )}
          ${this.renderSetting(
            msg("Block Ads by Domain"),
            crawlConfig?.config.blockAds,
          )}
          ${this.renderSetting(
            msg("User Agent"),
            crawlConfig?.config.userAgent
              ? crawlConfig.config.userAgent
              : html`<span class="text-neutral-400"
                  >${msg("Browser User Agent (default)")}</span
                >`,
          )}
          ${crawlConfig?.config.lang
            ? this.renderSetting(
                msg("Language"),
                ISO6391.getName(crawlConfig.config.lang),
              )
            : nothing}
        </btrix-desc-list>
      </section>
      <section id="crawl-scheduling" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${sectionStrings.scheduling}</h4>
        </btrix-section-heading>
        <btrix-desc-list>
          ${this.renderSetting(
            msg("Crawl Schedule Type"),
            crawlConfig?.schedule
              ? msg("Run on a Recurring Basis")
              : msg("No Schedule"),
          )}
          ${when(crawlConfig?.schedule, () =>
            this.renderSetting(
              msg("Schedule"),
              crawlConfig?.schedule
                ? humanizeSchedule(crawlConfig.schedule)
                : undefined,
            ),
          )}
        </btrix-desc-list>
      </section>
      ${this.hideMetadata
        ? nothing
        : html`
            <section id="crawl-metadata" class="mb-8">
              <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
                <h4>${msg("Metadata")}</h4>
              </btrix-section-heading>
              <btrix-desc-list>
                ${this.renderSetting(msg("Name"), crawlConfig?.name)}
                ${this.renderSetting(
                  msg("Description"),
                  crawlConfig?.description
                    ? html`
                        <p class="max-w-prose font-sans">
                          ${crawlConfig.description}
                        </p>
                      `
                    : undefined,
                )}
                ${this.renderSetting(
                  msg("Tags"),
                  crawlConfig?.tags.length
                    ? crawlConfig.tags.map(
                        (tag) =>
                          html`<btrix-tag class="mr-2 mt-1">${tag}</btrix-tag>`,
                      )
                    : [],
                )}
                ${this.renderSetting(
                  msg("Collections"),
                  this.collections.length
                    ? this.collections.map(
                        (coll) =>
                          html`<sl-tag class="mr-2 mt-1" variant="neutral">
                            ${coll.name}
                            <span class="font-monostyle pl-1 text-xs">
                              (${formatNumber(coll.crawlCount)}
                              ${pluralOf("items", coll.crawlCount)})
                            </span>
                          </sl-tag>`,
                      )
                    : undefined,
                )}
              </btrix-desc-list>
            </section>
          `}
    `;
  }

  private readonly renderConfirmUrlListSettings = () => {
    const crawlConfig = this.crawlConfig;

    return html`
      ${this.renderSetting(
        msg("Page URL(s)"),
        html`
          <ul>
            ${this.seeds?.map(
              (seed: Seed) => html`
                <li>
                  <a
                    class="text-blue-600 hover:text-blue-500 hover:underline"
                    href="${seed.url}"
                    target="_blank"
                    rel="noreferrer"
                    >${seed.url}</a
                  >
                </li>
              `,
            )}
          </ul>
        `,
        true,
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page"),
        Boolean(crawlConfig?.config.extraHops),
      )}
      ${this.renderSetting(
        msg("Fail Crawl On Failed URL"),
        Boolean(crawlConfig?.config.failOnFailedSeed),
      )}
    `;
  };

  private readonly renderConfirmSeededSettings = () => {
    if (!this.seeds) return;
    const crawlConfig = this.crawlConfig!;
    const seedsConfig = crawlConfig.config;
    const additionalUrlList = this.seeds.slice(1);
    const primarySeedConfig = this.seeds[0] as SeedConfig | Seed | undefined;
    const primarySeedUrl = (primarySeedConfig as Seed | undefined)?.url;
    const includeUrlList =
      primarySeedConfig?.include || seedsConfig.include || [];
    return html`
      ${this.renderSetting(
        msg("Crawl Start URL"),
        primarySeedUrl
          ? html`<a
              class="text-blue-600 hover:text-blue-500 hover:underline"
              href="${primarySeedUrl}"
              target="_blank"
              rel="noreferrer"
              >${primarySeedUrl}</a
            >`
          : undefined,
        true,
      )}
      ${this.renderSetting(
        msg("Scope"),
        scopeTypeLabel[primarySeedConfig!.scopeType || seedsConfig.scopeType!],
      )}
      ${this.renderSetting(
        msg("Extra URL Prefixes in Scope"),
        includeUrlList.length
          ? html`
              <ul>
                ${includeUrlList.map(
                  (url: string) =>
                    staticHtml`<li class="regex">${unsafeStatic(
                      new RegexColorize().colorizeText(url) as string,
                    )}</li>`,
                )}
              </ul>
            `
          : msg("None"),
        true,
      )}
      ${when(
        DEPTH_SUPPORTED_SCOPES.includes(
          primarySeedConfig!.scopeType || seedsConfig.scopeType!,
        ),
        () =>
          this.renderSetting(
            msg("Max Depth"),
            primarySeedConfig && primarySeedConfig.depth !== null
              ? msg(str`${primarySeedConfig.depth} hop(s)`)
              : msg("Unlimited (default)"),
          ),
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(primarySeedConfig?.extraHops ?? seedsConfig.extraHops),
      )}
      ${this.renderSetting(
        msg("Check For Sitemap"),
        Boolean(seedsConfig.useSitemap),
      )}
      ${this.renderSetting(
        msg("List of Additional URLs"),
        additionalUrlList.length
          ? html`
              <ul>
                ${additionalUrlList.map((seed) => {
                  const seedUrl = typeof seed === "string" ? seed : seed.url;
                  return html`<li>
                    <a
                      class="text-primary hover:text-indigo-400"
                      href="${seedUrl}"
                      target="_blank"
                      rel="noreferrer"
                      >${seedUrl}</a
                    >
                  </li>`;
                })}
              </ul>
            `
          : msg("None"),
        true,
      )}
    `;
  };

  private renderSetting(label: string, value: unknown, breakAll?: boolean) {
    let content = value;

    if (!this.crawlConfig) {
      content = html` <sl-skeleton></sl-skeleton> `;
    } else if (typeof value === "boolean") {
      content = value ? msg("Yes") : msg("No");
    } else if (Array.isArray(value) && !value.length) {
      content = html`<span class="text-neutral-400">${msg("None")}</span>`;
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
      } catch (e) {
        this.notify({
          message:
            isApiError(e) && e.statusCode === 404
              ? msg("Collections not found.")
              : msg(
                  "Sorry, couldn't retrieve Collection details at this time.",
                ),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async getCollections() {
    const collections: Collection[] = [];
    const orgId = this.crawlConfig?.oid;

    if (this.crawlConfig?.autoAddCollections && orgId) {
      for (const collectionId of this.crawlConfig.autoAddCollections) {
        const data = await this.apiFetch<Collection | undefined>(
          `/orgs/${orgId}/collections/${collectionId}`,
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
      const settings = await getAppSettings();
      const orgDefaults = {
        ...this.orgDefaults,
      };

      if (settings.defaultBehaviorTimeSeconds > 0) {
        orgDefaults.behaviorTimeoutSeconds =
          settings.defaultBehaviorTimeSeconds;
      }
      if (settings.defaultPageLoadTimeSeconds > 0) {
        orgDefaults.pageLoadTimeoutSeconds =
          settings.defaultPageLoadTimeSeconds;
      }
      if (settings.maxPagesPerCrawl > 0) {
        orgDefaults.maxPagesPerCrawl = settings.maxPagesPerCrawl;
      }
      this.orgDefaults = orgDefaults;
    } catch (e) {
      console.debug(e);
    }
  }
}
