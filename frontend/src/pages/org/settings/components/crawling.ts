import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns, type Cols } from "@/layout/columns";
import infoText from "@/strings/crawl-workflows/infoText";
import {
  appDefaults,
  defaultLabel,
  getServerDefaults,
  sectionLabels,
  type SectionsEnum,
  type WorkflowDefaults,
} from "@/utils/workflow";

function section(section: SectionsEnum, cols: Cols) {
  return html`
    <section class="p-5">
      <btrix-section-heading>${sectionLabels[section]}</btrix-section-heading>
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

  private renderWorkflowDefaults() {
    return html`
      <div class="rounded-lg border">
        ${this.renderPerCrawlLimits()} ${this.renderPerPageLimits()}
      </div>
    `;
  }

  private renderPerCrawlLimits() {
    const pageLimit = html`<sl-input
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
    </sl-input>`;

    const crawlTimeoutMinutes = html`
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
    `;

    const maxCrawlSizeGB = html`
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
    `;

    return section("perCrawlLimits", [
      [pageLimit, infoText["pageLimit"]],
      [crawlTimeoutMinutes, infoText["crawlTimeoutMinutes"]],
      [maxCrawlSizeGB, infoText["maxCrawlSizeGB"]],
    ]);
  }

  private renderPerPageLimits() {
    const pageLoadTimeoutSeconds = html`
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
    `;

    const postLoadDelaySeconds = html`
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
    `;

    const behaviorTimeoutSeconds = html`
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
    `;

    const pageExtraDelaySeconds = html`
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
    `;

    return section("perPageLimits", [
      [pageLoadTimeoutSeconds, infoText["pageLoadTimeoutSeconds"]],
      [postLoadDelaySeconds, infoText["postLoadDelaySeconds"]],
      [behaviorTimeoutSeconds, infoText["behaviorTimeoutSeconds"]],
      [pageExtraDelaySeconds, infoText["pageExtraDelaySeconds"]],
    ]);
  }

  private async fetchServerDefaults() {
    this.defaults = await getServerDefaults();
  }
}
