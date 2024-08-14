import { localized } from "@lit/localize";
import { css, html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { columns } from "@/layout/columns";
import { sectionLabels, SECTIONS } from "@/utils/workflow";

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
        ${SECTIONS.map(
          (section) => html`
            <section class="p-5">
              <btrix-section-heading>
                ${sectionLabels[section]}
              </btrix-section-heading>
              ${columns([[html`TODO`, html`TODO`]])}
            </section>
          `,
        )}
      </div>
    `;
  }
}
