import { consume } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import ISO6391 from "iso-639-1";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";
import { none, notSpecified } from "@/layouts/empty";
import {
  Behavior,
  CrawlerChannelImage,
  type CrawlConfig,
  type Seed,
  type SeedConfig,
} from "@/pages/org/types";
import { labelFor } from "@/strings/crawl-workflows/labels";
import scopeTypeLabel from "@/strings/crawl-workflows/scopeType";
import sectionStrings from "@/strings/crawl-workflows/section";
import { WorkflowScopeType, type StorageSeedFile } from "@/types/workflow";
import { unescapeCustomPrefix } from "@/utils/crawl-workflows/unescapeCustomPrefix";
import { DEPTH_SUPPORTED_SCOPES, isPageScopeType } from "@/utils/crawler";
import { humanizeSchedule } from "@/utils/cron";
import { pluralOf } from "@/utils/pluralize";
import { richText } from "@/utils/rich-text";
import { getServerDefaults } from "@/utils/workflow";

/**
 * Usage:
 * ```ts
 * <btrix-config-details
 *   .crawlConfig=${this.crawlConfig}
 * ></btrix-config-details>
 * ```
 */
@customElement("btrix-config-details")
@localized()
export class ConfigDetails extends BtrixElement {
  @consume({ context: orgProxiesContext, subscribe: true })
  private readonly orgProxies?: OrgProxiesContext;

  @property({ type: Object })
  crawlConfig?: CrawlConfig;

  @property({ type: Array })
  seeds?: Seed[];

  @property({ type: Object })
  seedFile?: StorageSeedFile;

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

  async connectedCallback() {
    super.connectedCallback();
    void this.fetchOrgDefaults();
  }

  render() {
    const crawlConfig = this.crawlConfig;
    const renderTimeLimit = (
      valueSeconds?: number | null,
      fallbackValue?: number,
    ) => {
      if (valueSeconds) {
        return this.localize.humanizeDuration(valueSeconds * 1000, {
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
          value = this.localize.humanizeDuration(fallbackValue * 1000, {
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
        return this.localize.bytes(valueBytes, { unitDisplay: "narrow" });
      }

      return html`<span class="text-neutral-400"
        >${msg("Unlimited")} ${msg("(default)")}</span
      >`;
    };

    return html`
      ${this.renderSection({
        id: "crawler-settings",
        heading: sectionStrings.scope,
        renderDescItems: (seedsConfig) =>
          when(
            seedsConfig,
            (config) => html`
              ${this.renderSetting(
                msg("Crawl Scope"),
                config.seedFileId
                  ? scopeTypeLabel[WorkflowScopeType.PageList]
                  : when(this.seeds, (seeds) => {
                      if (!config.scopeType) return;
                      if (
                        isPageScopeType(config.scopeType) &&
                        seeds.length > 1
                      ) {
                        return scopeTypeLabel[WorkflowScopeType.PageList];
                      }
                      return scopeTypeLabel[config.scopeType];
                    }),
              )}
              ${isPageScopeType(config.scopeType)
                ? this.renderConfirmUrlListSettings(config)
                : this.renderConfirmSeededSettings(config)}
            `,
          ),
      })}
      ${this.renderSection({
        id: "crawl-limits",
        heading: sectionStrings.limits,
        renderDescItems: (seedsConfig) => html`
          ${this.renderSetting(
            msg("Max Pages"),
            when(seedsConfig && this.seeds, (seeds) => {
              const primarySeed = seeds[0] as Seed | undefined;
              const maxPages = primarySeed?.limit ?? seedsConfig?.limit;

              if (maxPages) {
                return `${this.localize.number(+maxPages)} ${pluralOf("pages", +maxPages)}`;
              }

              if (this.orgDefaults?.maxPagesPerCrawl) {
                return html`<span class="text-neutral-400">
                  ${this.orgDefaults.maxPagesPerCrawl === Infinity
                    ? msg("Unlimited")
                    : this.localize.number(this.orgDefaults.maxPagesPerCrawl)}
                  ${pluralOf("pages", this.orgDefaults.maxPagesPerCrawl)}
                  ${msg("(default)")}</span
                >`;
              }
            }),
          )}
          ${this.renderSetting(
            msg("Crawl Time Limit"),
            renderTimeLimit(this.crawlConfig?.crawlTimeout, Infinity),
          )}
          ${this.renderSetting(
            msg("Crawl Size Limit"),
            renderSize(this.crawlConfig?.maxCrawlSize),
          )}
        `,
      })}
      ${this.renderSection({
        id: "browser-behaviors",
        heading: sectionStrings.behaviors,
        renderDescItems: (seedsConfig) => html`
          ${this.renderSetting(
            labelFor.behaviors,
            [
              seedsConfig?.behaviors?.includes(Behavior.AutoScroll) &&
                labelFor.autoscrollBehavior,
              seedsConfig?.behaviors?.includes(Behavior.AutoClick) &&
                labelFor.autoclickBehavior,
            ]
              .filter((v) => v)
              .join(", ") || none,
          )}
          ${when(
            seedsConfig?.behaviors?.includes(Behavior.AutoClick) &&
              seedsConfig.clickSelector,
            (clickSelector) =>
              this.renderSetting(
                labelFor.clickSelector,
                html`<btrix-code
                  language="css"
                  value=${clickSelector}
                ></btrix-code>`,
              ),
          )}
          ${this.renderSetting(
            labelFor.customBehaviors,
            seedsConfig?.customBehaviors.length
              ? html`
                  <btrix-custom-behaviors-table
                    .customBehaviors=${seedsConfig.customBehaviors}
                  ></btrix-custom-behaviors-table>
                `
              : none,
          )}
          ${this.renderSetting(
            labelFor.pageLoadTimeoutSeconds,
            renderTimeLimit(
              seedsConfig?.pageLoadTimeout,
              this.orgDefaults?.pageLoadTimeoutSeconds ?? Infinity,
            ),
          )}
          ${this.renderSetting(
            labelFor.postLoadDelaySeconds,
            renderTimeLimit(seedsConfig?.postLoadDelay, 0),
          )}
          ${this.renderSetting(
            labelFor.behaviorTimeoutSeconds,
            renderTimeLimit(
              seedsConfig?.behaviorTimeout,
              this.orgDefaults?.behaviorTimeoutSeconds ?? Infinity,
            ),
          )}
          ${this.renderSetting(
            labelFor.pageExtraDelaySeconds,
            renderTimeLimit(seedsConfig?.pageExtraDelay, 0),
          )}
        `,
      })}
      ${this.renderSection({
        id: "browser-settings",
        heading: sectionStrings.browserSettings,
        renderDescItems: (seedsConfig) => html`
          ${this.renderSetting(
            msg("Browser Profile"),
            when(
              crawlConfig?.profileid,
              () => html`
                <btrix-link
                  href=${`${this.navigate.orgBasePath}/browser-profiles/profile/${
                    crawlConfig!.profileid
                  }`}
                  hideIcon
                >
                  ${crawlConfig?.profileName}
                </btrix-link>
              `,
              () =>
                crawlConfig?.profileName ||
                html`<span class="text-neutral-400"
                  >${msg("No custom profile")}</span
                >`,
            ),
          )}
          ${crawlConfig?.proxyId
            ? this.renderSetting(
                msg("Crawler Proxy Server"),
                this.orgProxies?.servers.find(
                  ({ id }) => id === crawlConfig.proxyId,
                )?.label || capitalize(crawlConfig.proxyId),
              )
            : nothing}
          ${this.renderSetting(
            msg("Browser Windows"),
            crawlConfig?.browserWindows ? `${crawlConfig.browserWindows}` : "",
          )}
          ${this.renderSetting(
            `${msg("Crawler Channel")} ${crawlConfig?.image ? msg("(Exact Crawler Version)") : ""}`.trim(),
            capitalize(
              crawlConfig?.crawlerChannel || CrawlerChannelImage.Default,
            ) + (crawlConfig?.image ? ` (${crawlConfig.image})` : ""),
          )}
          ${this.renderSetting(
            msg("Block Ads by Domain"),
            seedsConfig?.blockAds,
          )}
          ${this.renderSetting(
            msg("Save Local and Session Storage"),
            seedsConfig?.saveStorage,
          )}
          ${this.renderSetting(
            msg("User Agent"),
            seedsConfig?.userAgent
              ? seedsConfig.userAgent
              : html`<span class="text-neutral-400"
                  >${msg("Browser User Agent (default)")}</span
                >`,
          )}
          ${seedsConfig?.lang
            ? this.renderSetting(
                msg("Language"),
                ISO6391.getName(seedsConfig.lang),
              )
            : nothing}
        `,
      })}
      ${this.renderSection({
        id: "crawl-scheduling",
        heading: sectionStrings.scheduling,
        renderDescItems: () => html`
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
        `,
      })}
      ${when(!this.hideMetadata, () =>
        this.renderSection({
          id: "collection",
          heading: sectionStrings.collections,
          renderDescItems: () => html`
            ${this.renderSetting(
              html`<span class="mb-1 inline-block"
                >${msg("Auto-Add to Collection")}</span
              >`,
              crawlConfig?.autoAddCollections.length
                ? html`<btrix-linked-collections
                    .collections=${crawlConfig.autoAddCollections}
                  ></btrix-linked-collections>`
                : undefined,
            )}
          `,
        }),
      )}
      ${when(!this.hideMetadata, () =>
        this.renderSection({
          id: "crawl-metadata",
          heading: sectionStrings.metadata,
          renderDescItems: () => html`
            ${this.renderSetting(msg("Name"), crawlConfig?.name)}
            ${this.renderSetting(
              msg("Description"),
              crawlConfig?.description
                ? html`
                    <p class="max-w-prose font-sans">
                      ${richText(crawlConfig.description)}
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
          `,
        }),
      )}
    `;
  }

  private renderSection({
    id,
    heading,
    renderDescItems,
  }: {
    id: string;
    heading: string;
    renderDescItems: (
      seedsConfig?: CrawlConfig["config"],
    ) => TemplateResult | undefined;
  }) {
    return html`
      <section id=${id} class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>${heading}</h4>
        </btrix-section-heading>
        <btrix-desc-list>
          ${renderDescItems(this.crawlConfig?.config)}
        </btrix-desc-list>
      </section>
    `;
  }

  private readonly renderConfirmUrlListSettings = (
    config: CrawlConfig["config"],
  ) => {
    const seedFile = () =>
      when(
        this.seedFile,
        (file) =>
          html`<btrix-file-list>
            <btrix-file-list-item
              name=${file.originalFilename}
              size=${file.size}
              href=${file.path}
              .removable=${false}
            >
              <span slot="name" class="flex gap-1 overflow-hidden">
                <sl-tooltip content=${file.originalFilename}>
                  <span class="truncate">${file.originalFilename}</span>
                </sl-tooltip>
                <span class="text-neutral-400" role="separator">&mdash;</span>
                <span class="whitespace-nowrap text-neutral-500"
                  >${this.localize.number(file.seedCount)}
                  ${pluralOf("URLs", file.seedCount)}</span
                >
              </span>
            </btrix-file-list-item>
          </btrix-file-list>`,
      );

    const seeds = () =>
      when(
        this.seeds,
        (seeds) => html`
          <btrix-table class="grid-cols-[1fr_auto]">
            ${seeds.map(
              (seed: Seed) => html`
                <btrix-table-row>
                  <btrix-table-cell>
                    <btrix-overflow-scroll
                      class="-ml-5 w-[calc(100%+theme(spacing.5))] contain-inline-size part-[content]:px-5 part-[content]:[scrollbar-width:thin]"
                    >
                      <btrix-code
                        language="url"
                        class="block w-max whitespace-nowrap"
                        .value=${seed.url}
                      ></btrix-code>
                    </btrix-overflow-scroll>
                  </btrix-table-cell>
                  <btrix-table-cell>
                    <btrix-copy-button .value=${seed.url} placement="left">
                    </btrix-copy-button>
                    <sl-tooltip
                      placement="right"
                      content=${msg("Open in New Tab")}
                    >
                      <sl-icon-button
                        name="arrow-up-right"
                        href="${seed.url}"
                        target="_blank"
                      >
                      </sl-icon-button>
                    </sl-tooltip>
                  </btrix-table-cell>
                </btrix-table-row>
              `,
            )}
          </btrix-table>
        `,
      );

    return html`
      ${this.renderSetting(
        config.seedFileId || (this.seeds && this.seeds.length > 1)
          ? msg("URLs to Crawl")
          : msg("URL to Crawl"),
        config.seedFileId ? seedFile() : seeds(),
        true,
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(config.extraHops),
      )}
      ${this.renderSetting(
        msg("Skip Pages Disallowed by robots.txt"),
        Boolean(config.useRobots),
      )}
      ${this.renderSetting(
        msg("Fail Crawl If Not Logged In"),
        Boolean(config.failOnContentCheck),
      )}
      ${when(
        config.extraHops,
        () => html`${this.renderLinkSelectors()}${this.renderExclusions()}`,
      )}
    `;
  };

  private readonly renderConfirmSeededSettings = (
    config: CrawlConfig["config"],
  ) => {
    if (!this.seeds) return;
    const additionalUrlList = this.seeds.slice(1);
    const primarySeedConfig = this.seeds[0] as SeedConfig | Seed | undefined;
    const primarySeedUrl = (primarySeedConfig as Seed | undefined)?.url;
    const includeUrlList = primarySeedConfig?.include || config.include || [];
    const scopeType = config.scopeType!;

    return html`
      ${this.renderSetting(
        msg("Crawl Start URL"),
        primarySeedUrl
          ? html`
              <btrix-overflow-scroll
                class="-mx-5 w-[calc(100%+theme(spacing.10))] contain-inline-size part-[content]:px-5 part-[content]:[scrollbar-width:thin]"
              >
                <a
                  class="decoration-blue-500 hover:underline"
                  href="${primarySeedUrl}"
                  target="_blank"
                  rel="noreferrer"
                >
                  <btrix-code
                    language="url"
                    .value="${primarySeedUrl}"
                  ></btrix-code>
                </a>
              </btrix-overflow-scroll>
            `
          : undefined,
        true,
      )}
      ${when(scopeType === WorkflowScopeType.Custom, () =>
        this.renderSetting(
          msg("Page URL Prefixes"),
          includeUrlList.length
            ? html`
                <btrix-data-table
                  .columns=${[msg("URL Prefix")]}
                  .rows=${includeUrlList.map((url) => [
                    unescapeCustomPrefix(url),
                  ])}
                >
                </btrix-data-table>
              `
            : none,
          true,
        ),
      )}
      ${when(DEPTH_SUPPORTED_SCOPES.includes(scopeType), () =>
        this.renderSetting(
          msg("Max Depth in Scope"),
          primarySeedConfig && primarySeedConfig.depth !== null
            ? msg(str`${primarySeedConfig.depth} hop(s)`)
            : msg("Unlimited (default)"),
        ),
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(primarySeedConfig?.extraHops ?? config.extraHops),
      )}
      ${this.renderSetting(
        msg("Skip Pages Disallowed by robots.txt"),
        Boolean(config.useRobots),
      )}
      ${this.renderSetting(
        msg("Check For Sitemap"),
        Boolean(config.useSitemap),
      )}
      ${this.renderSetting(
        msg("Fail Crawl if Not Logged In"),
        Boolean(config.failOnContentCheck),
      )}
      ${this.renderLinkSelectors()}
      ${this.renderSetting(
        msg("Additional Page URLs"),
        additionalUrlList.length
          ? html`
              <ul>
                ${additionalUrlList.map((seed) => {
                  const seedUrl = typeof seed === "string" ? seed : seed.url;
                  return html`<li>
                    <a
                      class="text-primary hover:text-primary-400"
                      href="${seedUrl}"
                      target="_blank"
                      rel="noreferrer"
                      >${seedUrl}</a
                    >
                  </li>`;
                })}
              </ul>
            `
          : none,
        true,
      )}
      ${this.renderExclusions()}
    `;
  };

  private renderLinkSelectors() {
    const selectors = this.crawlConfig?.config.selectLinks || [];

    return this.renderSetting(
      labelFor.selectLink,
      selectors.length
        ? html`
            <div class="mb-2">
              <btrix-link-selector-table
                .selectors=${selectors}
                aria-readonly="true"
              >
              </btrix-link-selector-table>
            </div>
          `
        : msg("None"),
    );
  }

  private renderExclusions() {
    const exclusions = this.crawlConfig?.config.exclude || [];

    return when(
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
      () => this.renderSetting(msg("Exclusions"), none),
    );
  }

  private renderSetting(
    label: string | TemplateResult,
    value: unknown,
    breakAll?: boolean,
  ) {
    let content = value;

    if (!this.crawlConfig) {
      content = html` <sl-skeleton></sl-skeleton> `;
    } else if (typeof value === "boolean") {
      content = value ? msg("Yes") : msg("No");
    } else if (Array.isArray(value) && !value.length) {
      content = none;
    } else if (typeof value !== "number" && !value) {
      content = notSpecified;
    }
    return html`
      <btrix-desc-list-item class=${breakAll ? "break-all" : ""}>
        <span slot="label">${label}</span>
        ${content}
      </btrix-desc-list-item>
    `;
  }

  // TODO Consolidate with workflow-editor
  private async fetchOrgDefaults() {
    try {
      const [serverDefaults, { quotas }] = await Promise.all([
        getServerDefaults(),
        this.api.fetch<{
          quotas: { maxPagesPerCrawl?: number };
        }>(`/orgs/${this.orgId}`),
      ]);

      const defaults = {
        ...this.orgDefaults,
        ...serverDefaults,
      };

      if (defaults.maxPagesPerCrawl && quotas.maxPagesPerCrawl) {
        defaults.maxPagesPerCrawl = Math.min(
          defaults.maxPagesPerCrawl,
          quotas.maxPagesPerCrawl,
        );
      }

      this.orgDefaults = defaults;
    } catch (e) {
      console.debug(e);
    }
  }
}
