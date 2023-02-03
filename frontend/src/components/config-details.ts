import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { state, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized, str } from "@lit/localize";
import RegexColorize from "regex-colorize";
import ISO6391 from "iso-639-1";

import LiteElement, { html } from "../utils/LiteElement";
import type { CrawlConfig, Seed, SeedConfig } from "../pages/org/types";
import { humanizeSchedule } from "../utils/cron";

/**
 * Usage:
 * ```ts
 * <btrix-config-details
 *   .crawlConfig=${this.crawlConfig}
 * ></btrix-config-details>
 * ```
 */
@localized()
export class ConfigDetails extends LiteElement {
  @property({ type: Object })
  crawlConfig?: CrawlConfig;

  @property({ type: Boolean })
  anchorLinks = false;

  // Hide tag field, e.g. if embedded in crawl detail view
  @property({ type: Boolean })
  hideTags = false;

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

  render() {
    const crawlConfig = this.crawlConfig;
    const exclusions = crawlConfig?.config.exclude || [];
    return html`
      <section id="crawl-information" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)">
          <h4>
            ${this.renderAnchorLink("crawl-information")}${msg(
              "Crawl Information"
            )}
          </h4></btrix-section-heading
        >
        <btrix-desc-list>
          ${this.renderSetting(msg("Name"), crawlConfig?.name)}
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
        </btrix-desc-list>
      </section>
      <section id="crawler-settings" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)"
          ><h4>
            ${this.renderAnchorLink("crawler-settings")}
            ${msg("Crawler Settings")}
          </h4></btrix-section-heading
        >
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
            msg("Page Time Limit"),
            crawlConfig?.config.behaviorTimeout
              ? msg(str`${crawlConfig?.config.behaviorTimeout / 60} minute(s)`)
              : msg("None")
          )}
          ${this.renderSetting(
            msg("Crawl Time Limit"),
            crawlConfig?.crawlTimeout
              ? msg(str`${crawlConfig?.crawlTimeout / 60} minute(s)`)
              : msg("None")
          )}
          ${this.renderSetting(msg("Crawler Instances"), crawlConfig?.scale)}
        </btrix-desc-list>
      </section>
      <section id="browser-settings" class="mb-8">
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)"
          ><h4>
            ${this.renderAnchorLink("browser-settings")}
            ${msg("Browser Settings")}
          </h4></btrix-section-heading
        >
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
        <btrix-section-heading style="--margin: var(--sl-spacing-medium)"
          ><h4>
            ${this.renderAnchorLink("crawl-scheduling")}
            ${msg("Crawl Scheduling")}
          </h4></btrix-section-heading
        >
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
              (url: any) => html` <li>${url}</li> `
            )}
          </ul>
        `
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
    let primarySeedConfig: SeedConfig | Seed = seedsConfig;
    let primarySeedUrl = seedsConfig.seeds[0];
    if (typeof seedsConfig.seeds[0] !== "string") {
      primarySeedConfig = seedsConfig.seeds[0];
      primarySeedUrl = primarySeedConfig.url;
    }
    const includeUrlList = primarySeedConfig.include || seedsConfig.include;
    return html`
      ${this.renderSetting(msg("Primary Seed URL"), primarySeedUrl)}
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
          : msg("None")
      )}
      ${this.renderSetting(
        msg("Include Any Linked Page (“one hop out”)"),
        Boolean(primarySeedConfig.extraHops ?? seedsConfig.extraHops)
      )}
      ${this.renderSetting(
        msg("List of Additional URLs"),
        additionalUrlList?.length
          ? html`
              <ul>
                ${additionalUrlList.map((url) => html`<li>${url}</li>`)}
              </ul>
            `
          : msg("None")
      )}
      ${this.renderSetting(
        msg("Max Pages"),
        seedsConfig.limit
          ? msg(str`${primarySeedConfig.limit ?? seedsConfig.limit} pages`)
          : msg("Unlimited")
      )}
    `;
  };

  private renderAnchorLink(id: string) {
    if (!this.anchorLinks) return;
    const currentUrl = window.location.href;
    return html`
      <a
        href=${`${currentUrl.replace(window.location.hash, "")}#${id}`}
        class="text-base hover:text-primary mr-1"
      >
        <sl-icon name="link-45deg" class="inline-block align-middle"></sl-icon>
      </a>
    `;
  }

  private renderSetting(label: string, value: any) {
    let content = value;

    if (!this.crawlConfig) {
      content = html` <sl-skeleton></sl-skeleton> `;
    } else if (typeof value === "boolean") {
      content = value ? msg("Yes") : msg("No");
    } else if (typeof value !== "number" && !value) {
      content = html`<span class="text-neutral-300"
        >${msg("Not specified")}</span
      >`;
    }
    return html`
      <btrix-desc-list-item label=${label}> ${content} </btrix-desc-list-item>
    `;
  }
}
