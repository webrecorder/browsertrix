import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { SeedConfig } from "@/types/crawler";

const SELECTOR_DELIMITER = "->" as const;
const COLUMNS = [msg("CSS Selector"), msg("Link Attribute")] as const;

@customElement("btrix-link-selector-table")
@localized()
export class LinkSelectorTable extends BtrixElement {
  @property({ type: Array })
  selectors: SeedConfig["selectLinks"] = [];

  render() {
    return html`
      <btrix-data-table
        .columns=${COLUMNS}
        .rows=${this.selectors.map(this.row)}
      >
      </btrix-data-table>
    `;
  }

  private readonly row = (item: string) => {
    const [sel, attr] = item.split(SELECTOR_DELIMITER);

    return [
      html`<btrix-code value=${sel} language="css"></btrix-code>`,
      html`<code class="font-monospace text-neutral-600">${attr}</code>`,
    ];
  };
}
