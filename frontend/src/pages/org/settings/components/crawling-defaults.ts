import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import type { SlButton } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { LanguageCode } from "iso-639-1";
import { css, html, type TemplateResult } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";
import type { Entries } from "type-fest";

import { BtrixElement } from "@/classes/BtrixElement";
import type { LanguageSelect } from "@/components/ui/language-select";
import type { SelectCrawlerProxy } from "@/components/ui/select-crawler-proxy";
import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";
import type { SelectBrowserProfile } from "@/features/browser-profiles/select-browser-profile";
import type { CustomBehaviorsTable } from "@/features/crawl-workflows/custom-behaviors-table";
import type { QueueExclusionTable } from "@/features/crawl-workflows/queue-exclusion-table";
import { columns, type Cols } from "@/layouts/columns";
import { infoTextFor } from "@/strings/crawl-workflows/infoText";
import { labelFor } from "@/strings/crawl-workflows/labels";
import sectionStrings from "@/strings/crawl-workflows/section";
import { crawlingDefaultsSchema, type CrawlingDefaults } from "@/types/org";
import { formValidator } from "@/utils/form";
import {
  appDefaults,
  BYTES_PER_GB,
  defaultLabel,
  getServerDefaults,
  type FormState,
  type SectionsEnum,
  type WorkflowDefaults,
} from "@/utils/workflow";

type FieldName = keyof FormState;
type Field = Record<FieldName, TemplateResult<1> | undefined>;

const PLACEHOLDER_EXCLUSIONS = [""]; // Add empty slot

function section(section: SectionsEnum, cols: Cols) {
  return html`
    <section class="p-5">
      <btrix-section-heading>${sectionStrings[section]}</btrix-section-heading>
      ${columns(cols)}
    </section>
  `;
}

@customElement("btrix-org-settings-crawling-defaults")
@localized()
export class OrgSettingsCrawlWorkflows extends BtrixElement {
  static styles = css`
    btrix-section-heading {
      --margin: var(--sl-spacing-small);
    }
  `;

  @consume({ context: orgProxiesContext, subscribe: true })
  private readonly proxies?: OrgProxiesContext;

  @consume({ context: orgCrawlerChannelsContext, subscribe: true })
  private readonly crawlerChannels?: OrgCrawlerChannelsContext;

  @state()
  private defaults: WorkflowDefaults = appDefaults;

  @query("btrix-queue-exclusion-table")
  exclusionTable?: QueueExclusionTable | null;

  @query("btrix-custom-behaviors-table")
  customBehaviorsTable?: CustomBehaviorsTable | null;

  @query("btrix-language-select")
  languageSelect?: LanguageSelect | null;

  @query("btrix-select-browser-profile")
  browserProfileSelect?: SelectBrowserProfile | null;

  @query("btrix-select-crawler-proxy")
  proxySelect?: SelectCrawlerProxy | null;

  @query('sl-button[type="submit"]')
  submitButton?: SlButton | null;

  private readonly checkFormValidity = formValidator(this);

  connectedCallback() {
    super.connectedCallback();

    void this.fetchServerDefaults();
  }

  render() {
    return html` ${this.renderWorkflowDefaults()} `;
  }

  get fields() {
    const orgDefaults: Partial<CrawlingDefaults> = this.org
      ?.crawlingDefaults || {
      exclude: PLACEHOLDER_EXCLUSIONS,
    };
    const scope = {
      exclusions: html`
        <btrix-queue-exclusion-table
          .exclusions=${orgDefaults.exclude?.length === 0
            ? PLACEHOLDER_EXCLUSIONS
            : orgDefaults.exclude}
          pageSize="30"
          labelClassName="text-xs"
          editable
          removable
          uncontrolled
        ></btrix-queue-exclusion-table>
      `,
    };
    const limits = {
      crawlTimeoutMinutes: html`
        <sl-input
          size="small"
          name="crawlTimeoutMinutes"
          label=${msg("Crawl Time Limit")}
          value=${ifDefined(
            typeof orgDefaults.crawlTimeout === "number"
              ? orgDefaults.crawlTimeout / 60
              : undefined,
          )}
          placeholder=${defaultLabel(Infinity)}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("minutes")}</span>
        </sl-input>
      `,
      maxCrawlSizeGB: html`
        <sl-input
          size="small"
          name="maxCrawlSizeGB"
          label=${msg("Crawl Size Limit")}
          value=${ifDefined(
            typeof orgDefaults.maxCrawlSize === "number"
              ? orgDefaults.maxCrawlSize / BYTES_PER_GB
              : undefined,
          )}
          placeholder=${defaultLabel(Infinity)}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("GB")}</span>
        </sl-input>
      `,
    };
    const behaviors = {
      customBehavior: html`
        <label class="form-label text-xs">${labelFor.customBehavior}</label>
        <btrix-custom-behaviors-table
          .customBehaviors=${orgDefaults.customBehaviors || []}
          editable
        ></btrix-custom-behaviors-table>
      `,
      pageLoadTimeoutSeconds: html`
        <sl-input
          size="small"
          name="pageLoadTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Page Load Timeout")}
          value=${ifDefined(orgDefaults.pageLoadTimeout ?? undefined)}
          placeholder=${defaultLabel(this.defaults.pageLoadTimeoutSeconds)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
      postLoadDelaySeconds: html`
        <sl-input
          size="small"
          name="postLoadDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Delay After Page Load")}
          value=${ifDefined(orgDefaults.postLoadDelay ?? undefined)}
          placeholder=${defaultLabel(0)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
      behaviorTimeoutSeconds: html`
        <sl-input
          size="small"
          name="behaviorTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Behavior Timeout")}
          value=${ifDefined(orgDefaults.behaviorTimeout ?? undefined)}
          placeholder=${defaultLabel(this.defaults.behaviorTimeoutSeconds)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
      pageExtraDelaySeconds: html`
        <sl-input
          size="small"
          name="pageExtraDelaySeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Delay Before Next Page")}
          value=${ifDefined(orgDefaults.pageExtraDelay ?? undefined)}
          placeholder=${defaultLabel(0)}
          min="0"
        >
          <span slot="suffix">${msg("seconds")}</span>
        </sl-input>
      `,
    };
    const proxies = this.proxies;
    const crawlerChannels = this.crawlerChannels;

    const browserSettings = {
      browserProfile: html`
        <btrix-select-browser-profile
          profileId=${ifDefined(orgDefaults.profileid ?? undefined)}
          size="small"
        ></btrix-select-browser-profile>
      `,
      proxyId: proxies?.servers.length
        ? html` <btrix-select-crawler-proxy
            defaultProxyId=${ifDefined(proxies.default_proxy_id ?? undefined)}
            .proxyServers=${proxies.servers}
            .proxyId="${orgDefaults.proxyId || null}"
            size="small"
          ></btrix-select-crawler-proxy>`
        : undefined,
      crawlerChannel:
        crawlerChannels && crawlerChannels.length > 1
          ? html`
              <btrix-select-crawler
                crawlerChannel=${ifDefined(
                  orgDefaults.crawlerChannel ?? undefined,
                )}
                size="small"
              ></btrix-select-crawler>
            `
          : undefined,
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
          value=${ifDefined(orgDefaults.userAgent ?? undefined)}
          autocomplete="off"
          placeholder=${msg("Default: Browser User Agent")}
        >
        </sl-input>
      `,
      lang: html`
        <btrix-language-select
          value=${ifDefined(
            orgDefaults.lang ? (orgDefaults.lang as LanguageCode) : undefined,
          )}
          size="small"
          @on-change=${(e: CustomEvent<{ value: string | undefined }>) => {
            console.log(e.detail.value);
          }}
        >
          <span slot="label">${msg("Language")}</span>
        </btrix-language-select>
      `,
    };

    return {
      scope,
      limits,
      behaviors,
      browserSettings,
    } as const satisfies Partial<Record<SectionsEnum, Partial<Field>>>;
  }

  private renderWorkflowDefaults() {
    return html`
      <div class="rounded-lg border">
        <form @submit=${this.onSubmit}>
          ${guard([this.defaults, this.org], () =>
            Object.entries(this.fields).map(([sectionName, fields]) => {
              const cols: Cols = [];

              (Object.entries(fields) as Entries<Field>).forEach(
                ([fieldName, field]) => {
                  if (field) {
                    cols.push([
                      field,
                      infoTextFor[fieldName as keyof typeof infoTextFor],
                    ]);
                  }
                },
              );

              return section(sectionName as SectionsEnum, cols);
            }),
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

    // Wait for custom behaviors validation to finish
    // TODO Move away from manual validation check
    // See https://github.com/webrecorder/browsertrix/issues/2536
    if (this.customBehaviorsTable) {
      if (!this.customBehaviorsTable.checkValidity()) {
        this.customBehaviorsTable.reportValidity();
        return;
      }

      try {
        await this.customBehaviorsTable.taskComplete;
      } catch {
        this.customBehaviorsTable.reportValidity();
        return;
      }
    }

    const isValid = await this.checkFormValidity(form);

    if (!isValid) {
      form.reportValidity();
      return;
    }

    const values = serialize(form) as Record<string, string>;
    const parseNumber = (value: string) => (value ? Number(value) : undefined);
    const parsedValues: Partial<CrawlingDefaults> = {
      crawlTimeout: values.crawlTimeoutMinutes
        ? Number(values.crawlTimeoutMinutes) * 60
        : undefined,
      maxCrawlSize: values.maxCrawlSizeGB
        ? Number(values.maxCrawlSizeGB) * BYTES_PER_GB
        : undefined,
      pageLoadTimeout: parseNumber(values.pageLoadTimeoutSeconds),
      postLoadDelay: parseNumber(values.postLoadDelaySeconds),
      behaviorTimeout: parseNumber(values.behaviorTimeoutSeconds),
      pageExtraDelay: parseNumber(values.pageExtraDelaySeconds),
      blockAds: values.blockAds === "on",
      profileid: this.browserProfileSelect?.value ?? undefined,
      crawlerChannel: values.crawlerChannel,
      proxyId: this.proxySelect?.value ?? undefined,
      userAgent: values.userAgent,
      lang: this.languageSelect?.value ?? undefined,
      exclude: this.exclusionTable?.exclusions?.filter((v) => v) || [],
      customBehaviors: this.customBehaviorsTable?.value || [],
      dedupeCollId: values.dedupeCollectionId || "",
    };

    // Set null or empty strings to undefined
    const params = Object.entries(parsedValues).reduce(
      (acc, [k, v]) => ({
        ...acc,
        [k]:
          typeof v === "number" || typeof v === "boolean" ? v : v || undefined,
      }),
      parsedValues,
    );

    crawlingDefaultsSchema.partial().parse(params);

    this.submitButton?.setAttribute("loading", "true");

    try {
      await this.api.fetch(`/orgs/${this.orgId}/defaults/crawling`, {
        method: "POST",
        body: JSON.stringify(params),
      });

      this.notify.toast({
        message: msg("Crawl defaults have been updated."),
        variant: "success",
        icon: "check2-circle",
        id: "crawl-defaults-update-status",
      });
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't update crawl defaults at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "crawl-defaults-update-status",
      });
    }

    this.submitButton?.removeAttribute("loading");
  }

  private async fetchServerDefaults() {
    this.defaults = await getServerDefaults();
  }
}
