import { localized, msg } from "@lit/localize";
import { css, html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layout/columns";
import infoTextStrings from "@/strings/crawl-workflows/infoText";
import sectionStrings from "@/strings/crawl-workflows/section";
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
@customElement("btrix-org-settings-crawling")
export class OrgSettingsCrawing extends BtrixElement {
  static styles = css`
    btrix-section-heading {
      --margin: var(--sl-spacing-small);
    }
  `;

  @state()
  private defaults: WorkflowDefaults = appDefaults;

  connectedCallback() {
    super.connectedCallback();
    void this.fetchServerDefaults();
  }

  firstUpdated() {
    console.log(this.orgId);
  }

  render() {
    return html` ${this.renderWorkflowDefaults()} `;
  }

  get fields(): Partial<Record<SectionsEnum, Partial<Field>>> {
    const scope = {
      exclusions: html`
        <btrix-queue-exclusion-table
          pageSize="30"
          labelClassName="text-xs"
          editable
          removable
        ></btrix-queue-exclusion-table>
        <sl-button class="mt-1 w-full" size="small">
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          <span class="text-neutral-600">${msg("Add More")}</span>
        </sl-button>
      `,
    };
    const perCrawlLimits = {
      pageLimit: html`<sl-input
        size="small"
        name="pageLimit"
        label=${msg("Max Pages")}
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
      crawlTimeoutMinutes: html`
        <sl-input
          size="small"
          name="crawlTimeoutMinutes"
          label=${msg("Crawl Time Limit")}
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
          placeholder=${defaultLabel(Infinity)}
          min="0"
          type="number"
          inputmode="numeric"
        >
          <span slot="suffix">${msg("GB")}</span>
        </sl-input>
      `,
    };
    const perPageLimits = {
      pageLoadTimeoutSeconds: html`
        <sl-input
          size="small"
          name="pageLoadTimeoutSeconds"
          type="number"
          inputmode="numeric"
          label=${msg("Page Load Timeout")}
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
          size="small"
        ></btrix-select-browser-profile>
      `,
      crawlerChannel: html`
        <btrix-select-crawler size="small"></btrix-select-crawler>
      `,
      blockAds: html`<sl-checkbox size="small" name="blockAds">
        ${msg("Block ads by domain")}
      </sl-checkbox>`,
      userAgent: html`
        <sl-input
          size="small"
          name="userAgent"
          label=${msg("User Agent")}
          autocomplete="off"
          placeholder=${msg("Default")}
        >
        </sl-input>
      `,
      lang: html`
        <btrix-language-select size="small">
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
        ${guard([this.defaults], () =>
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
      </div>
    `;
  }

  private async fetchServerDefaults() {
    this.defaults = await getServerDefaults();
  }
}
