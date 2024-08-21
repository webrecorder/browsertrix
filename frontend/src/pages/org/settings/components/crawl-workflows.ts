import { localized, msg } from "@lit/localize";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { LanguageCode } from "iso-639-1";
import { css, html, type TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { LanguageSelect } from "@/components/ui/language-select";
import type { QueueExclusionTable } from "@/features/crawl-workflows/queue-exclusion-table";
import { columns, type Cols } from "@/layout/columns";
import infoTextStrings from "@/strings/crawl-workflows/infoText";
import sectionStrings from "@/strings/crawl-workflows/section";
import { crawlingDefaultsSchema, type CrawlingDefaults } from "@/types/org";
import {
  appDefaults,
  defaultLabel,
  getServerDefaults,
  type FormState,
  type SectionsEnum,
  type WorkflowDefaults,
} from "@/utils/workflow";

type FieldName = keyof FormState;
type Field = Record<FieldName, TemplateResult<1>>;

const PLACEHOLDER_EXCLUSIONS = [""]; // Add empty slot

function section(section: SectionsEnum | "exclusions", cols: Cols) {
  return html`
    <section class="p-5">
      <btrix-section-heading
        >${section === "exclusions"
          ? msg("Exclusions")
          : sectionStrings[section]}</btrix-section-heading
      >
      ${columns(cols)}
    </section>
  `;
}

@localized()
@customElement("btrix-org-settings-crawl-workflows")
export class OrgSettingsCrawlWorkflows extends BtrixElement {
  static styles = css`
    btrix-section-heading {
      --margin: var(--sl-spacing-small);
    }
  `;

  @state()
  private defaults: WorkflowDefaults = appDefaults;

  @query("btrix-queue-exclusion-table")
  exclusionTable?: QueueExclusionTable | null;

  @query("btrix-language-select")
  languageSelect?: LanguageSelect | null;

  connectedCallback() {
    super.connectedCallback();

    void this.fetchServerDefaults();
  }

  render() {
    return html` ${this.renderWorkflowDefaults()} `;
  }

  get fields(): Partial<Record<SectionsEnum, Partial<Field>>> {
    const orgDefaults: Partial<CrawlingDefaults> = this.org
      ?.crawlingDefaults || {
      exclude: PLACEHOLDER_EXCLUSIONS,
    };
    const scope = {
      exclusions: html`
        <btrix-queue-exclusion-table
          .exclusions=${orgDefaults.exclude}
          pageSize="30"
          labelClassName="text-xs"
          editable
          removable
          uncontrolled
        ></btrix-queue-exclusion-table>
      `,
    };
    const perCrawlLimits = {
      pageLimit: html`<sl-input
        size="small"
        name="limit"
        label=${msg("Max Pages")}
        value=${ifDefined(orgDefaults.limit)}
        type="number"
        inputmode="numeric"
        min=${
          // TODO handle dynamic min value, same as workflow editor?
          "1"
        }
        max=${ifDefined(
          this.defaults.maxPagesPerCrawl &&
            this.defaults.maxPagesPerCrawl < Infinity
            ? this.defaults.maxPagesPerCrawl
            : undefined,
        )}
        placeholder=${defaultLabel(this.defaults.maxPagesPerCrawl)}
      >
        <span slot="suffix">${msg("pages")}</span>
      </sl-input>`,
      // crawlTimeoutMinutes: html`
      //   <sl-input
      //     size="small"
      //     name="crawlTimeoutMinutes"
      //     label=${msg("Crawl Time Limit")}
      //     value=${orgDefaults.crawlTimeout}
      //     placeholder=${defaultLabel(Infinity)}
      //     min="0"
      //     type="number"
      //     inputmode="numeric"
      //   >
      //     <span slot="suffix">${msg("minutes")}</span>
      //   </sl-input>
      // `,
      // maxCrawlSizeGB: html`
      //   <sl-input
      //     size="small"
      //     name="maxCrawlSizeGB"
      //     label=${msg("Crawl Size Limit")}
      //     value=${orgDefaults.maxCrawlSizeGB}
      //     placeholder=${defaultLabel(Infinity)}
      //     min="0"
      //     type="number"
      //     inputmode="numeric"
      //   >
      //     <span slot="suffix">${msg("GB")}</span>
      //   </sl-input>
      // `,
    };
    const perPageLimits = {
      pageLoadTimeoutSeconds: html`
        <sl-input
          size="small"
          name="pageLoadTimeout"
          type="number"
          inputmode="numeric"
          label=${msg("Page Load Timeout")}
          value=${ifDefined(orgDefaults.pageLoadTimeout)}
          placeholder=${defaultLabel(this.defaults.pageLoadTimeoutSeconds)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
      postLoadDelaySeconds: html`
        <sl-input
          size="small"
          name="postLoadDelay"
          type="number"
          inputmode="numeric"
          label=${msg("Delay After Page Load")}
          value=${ifDefined(orgDefaults.postLoadDelay)}
          placeholder=${defaultLabel(0)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
      behaviorTimeoutSeconds: html`
        <sl-input
          size="small"
          name="behaviorTimeout"
          type="number"
          inputmode="numeric"
          label=${msg("Behavior Timeout")}
          value=${ifDefined(orgDefaults.behaviorTimeout)}
          placeholder=${defaultLabel(this.defaults.behaviorTimeoutSeconds)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
      pageExtraDelaySeconds: html`
        <sl-input
          size="small"
          name="pageExtraDelay"
          type="number"
          inputmode="numeric"
          label=${msg("Delay Before Next Page")}
          value=${ifDefined(orgDefaults.pageExtraDelay)}
          placeholder=${defaultLabel(0)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
    };
    const browserSettings = {
      browserProfile: html`
        <btrix-select-browser-profile
          profileId=${ifDefined(orgDefaults.profileid)}
          size="small"
        ></btrix-select-browser-profile>
      `,
      crawlerChannel: html`
        <btrix-select-crawler
          crawlerChannel=${ifDefined(orgDefaults.crawlerChannel)}
          size="small"
        ></btrix-select-crawler>
      `,
      blockAds: html`<sl-checkbox
        size="small"
        name="blockAds"
        ?checked=${orgDefaults.blockAds ?? true}
      >
        ${msg("Block ads by domain")}
      </sl-checkbox>`,
      userAgent: html`
        <sl-input
          size="small"
          name="userAgent"
          label=${msg("User Agent")}
          value=${ifDefined(orgDefaults.userAgent)}
          autocomplete="off"
          placeholder=${msg("Default")}
        >
        </sl-input>
      `,
      lang: html`
        <btrix-language-select
          value=${ifDefined(
            orgDefaults.lang ? (orgDefaults.lang as LanguageCode) : undefined,
          )}
          size="small"
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `,
    };

    return {
      scope,
      perCrawlLimits,
      perPageLimits,
      browserSettings,
    };
  }

  private renderWorkflowDefaults() {
    return html`
      <div class="rounded-lg border">
        <form @submit=${this.onSubmit}>
          ${guard([this.defaults, this.org], () =>
            Object.entries(this.fields).map(([sectionName, fields]) =>
              section(
                sectionName as SectionsEnum,
                Object.entries(fields).map(([fieldName, field]) => [
                  field,
                  infoTextStrings[fieldName as FieldName],
                ]),
              ),
            ),
          )}
          <footer class="flex justify-end border-t px-4 py-3">
            <sl-button type="submit" size="small" variant="primary">
              ${msg("Save Changes")}
            </sl-button>
          </footer>
        </form>
      </div>
    `;
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const values = serialize(form) as Record<string, string>;
    const parseNumber = (value: string) => (value ? Number(value) : undefined);
    const parsedValues: CrawlingDefaults = {
      limit: parseNumber(values.limit),
      // crawlTimeout: values.crawlTimeoutMinutes
      //   ? formatNumber(values.crawlTimeoutMinutes) * 60
      //   : null,
      pageLoadTimeout: parseNumber(values.pageLoadTimeout),
      postLoadDelay: parseNumber(values.postLoadDelay),
      behaviorTimeout: parseNumber(values.behaviorTimeout),
      pageExtraDelay: parseNumber(values.pageExtraDelay),
      blockAds: values.blockAds === "on",
      profileid: values.profileid,
      crawlerChannel: values.crawlerChannel,
      userAgent: values.userAgent,
      lang: this.languageSelect?.value,
      exclude: this.exclusionTable?.exclusions?.filter((v) => v) || [],
    };
    const params = Object.entries(parsedValues).reduce(
      (acc, [k, v]) => ({
        ...acc,
        [k]:
          typeof v === "number" || typeof v === "boolean" ? v : v || undefined,
      }),
      parsedValues,
    );

    crawlingDefaultsSchema.parse(params);

    try {
      await this.api.fetch(`/orgs/${this.orgId}/defaults/crawling`, {
        method: "POST",
        body: JSON.stringify(params),
      });

      this.notify.toast({
        message: msg("Crawl defaults have been updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't update crawl defaults at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async fetchServerDefaults() {
    this.defaults = await getServerDefaults();
  }
}
