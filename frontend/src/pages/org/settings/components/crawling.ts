import { localized, msg, str } from "@lit/localize";
import { css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { helpText } from "@/features/crawl-workflows/ui/helpText";
import { columns, type Cols } from "@/layout/columns";
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

  render() {
    return html` ${this.renderWorkflowDefaults()} `;
  }

  private renderWorkflowDefaults() {
    return html`
      <div class="rounded-lg border">${this.renderPerCrawlLimits()}</div>
    `;
  }

  private renderPerCrawlLimits() {
    const pageLimit = html`<sl-input
      name="pageLimit"
      label=${msg("Max Pages")}
      type="number"
      inputmode="numeric"
      value=${""}
      min=${"1"}
      max=${ifDefined(
        this.defaults.maxPagesPerCrawl &&
          this.defaults.maxPagesPerCrawl < Infinity
          ? this.defaults.maxPagesPerCrawl
          : undefined,
      )}
      placeholder=${defaultLabel(this.defaults.maxPagesPerCrawl)}
      help-text=${this.defaults.maxPagesPerCrawl &&
      this.defaults.maxPagesPerCrawl < Infinity
        ? msg(
            str`Enter a number between 1 and ${this.defaults.maxPagesPerCrawl.toLocaleString()}`,
          )
        : msg("Minimum 1 page")}
    >
      <span slot="suffix">${msg("pages")}</span>
    </sl-input>`;
    return section("perCrawlLimits", [[pageLimit, helpText("pageLimit")]]);
  }

  private async fetchServerDefaults() {
    this.defaults = await getServerDefaults();
  }
}
