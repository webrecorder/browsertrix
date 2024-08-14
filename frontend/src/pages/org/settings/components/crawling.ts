import { localized, msg } from "@lit/localize";
import { css, html } from "lit";
import { customElement } from "lit/decorators.js";

import { columns } from "../ui/columns";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-org-settings-crawling")
export class OrgSettingsCrawing extends BtrixElement {
  static styles = css`
    btrix-section-heading {
      --margin: var(--sl-spacing-small);
    }
  `;

  render() {
    return html` ${this.renderWorkflowDefaults()} `;
  }

  private renderWorkflowDefaults() {
    return html`
      <div class="rounded-lg border">
        <section class="p-5">
          <btrix-section-heading>
            ${msg("Crawler Settings")}
          </btrix-section-heading>
          ${columns([[html`TODO`, html`TODO`]])}
        </section>
        <section class="p-5">
          <btrix-section-heading>
            ${msg("Per-Crawl Limits")}
          </btrix-section-heading>
          ${columns([[html`TODO`, html`TODO`]])}
        </section>
        <section class="p-5">
          <btrix-section-heading>
            ${msg("Per-Page Limits")}
          </btrix-section-heading>
          ${columns([[html`TODO`, html`TODO`]])}
        </section>
        <section class="p-5">
          <btrix-section-heading>
            ${msg("Browser Settings")}
          </btrix-section-heading>
          ${columns([[html`TODO`, html`TODO`]])}
        </section>
      </div>
    `;
  }
}
