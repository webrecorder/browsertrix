import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { collectionStatusIcon } from "./templates/collection-status-icon";

import { BtrixElement } from "@/classes/BtrixElement";
import type { ArchivedItemSectionName } from "@/pages/org/archived-item-detail/archived-item-detail";
import { OrgTab, WorkflowTab } from "@/routes";
import type { ArchivedItem } from "@/types/crawler";
import { isCrawl, renderName } from "@/utils/crawler";

@customElement("btrix-item-dependents")
@localized()
export class ItemDependents extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @property({ type: Array })
  items?: ArchivedItem[];

  render() {
    if (!this.items?.length) return;

    return html`
      <btrix-table
        style="--btrix-table-grid-template-columns: ${[
          "min-content",
          "repeat(4, auto)",
          "min-content",
        ].join(" ")}"
      >
        <btrix-table-head
          class="mb-2 [--btrix-table-cell-padding-x:var(--sl-spacing-x-small)]"
        >
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Status")}</span>
          </btrix-table-header-cell>
          <btrix-table-header-cell class="pl-0"
            >${msg("Name")}</btrix-table-header-cell
          >
          <btrix-table-header-cell>
            ${msg("Dependents")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Date Created")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>${msg("Size")}</btrix-table-header-cell>
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body
          class="divide-y rounded border [--btrix-table-cell-padding-x:var(--sl-spacing-x-small)] [--btrix-table-cell-padding-y:var(--sl-spacing-2x-small)]"
        >
          ${this.items.map(this.renderRow)}
        </btrix-table-body>
      </btrix-table>
    `;
  }

  private readonly renderRow = (item: ArchivedItem) => {
    const crawled = isCrawl(item);

    return html`<btrix-table-row>
      <btrix-table-cell
        >${collectionStatusIcon({
          item,
          collectionId: this.collectionId,
        })}</btrix-table-cell
      >
      <btrix-table-cell class="pl-0">${renderName(item)}</btrix-table-cell>
      <btrix-table-cell>
        ${this.localize.number(item.requiredByCrawls.length, {
          notation: "compact",
        })}
      </btrix-table-cell>
      <btrix-table-cell>
        ${this.localize.date(item.finished || item.started, {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </btrix-table-cell>
      <btrix-table-cell>
        ${this.localize.bytes(item.fileSize || 0, { unitDisplay: "short" })}
      </btrix-table-cell>
      <btrix-table-cell>
        ${this.renderLink(
          crawled
            ? `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${item.cid}/${WorkflowTab.Crawls}/${item.id}#${"overview" as ArchivedItemSectionName}`
            : `${this.navigate.orgBasePath}/${OrgTab.Items}/${item.type}/${item.id}`,
        )}
      </btrix-table-cell>
    </btrix-table-row>`;
  };

  private renderLink(href: string) {
    return html`<sl-icon-button
      name="link"
      href=${href}
      label=${msg("Link")}
      @click=${this.navigate.link}
    >
    </sl-icon-button>`;
  }
}
