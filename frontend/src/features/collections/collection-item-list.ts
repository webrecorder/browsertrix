import { html, css, nothing, type TemplateResult } from "lit";
import { customElement, property, queryAll } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { msg, localized, str } from "@lit/localize";
import { type SlCheckbox } from "@shoelace-style/shoelace";

import type { ArchivedItem, Crawl } from "@/types/crawler";
import type { TableRow } from "@/components/ui/table/table-row";
import { TailwindElement } from "@/classes/TailwindElement";

export type SelectionChangeDetail = {
  selection: Record<string, boolean>;
};

/**
 * @example Usage:
 * ```ts
 * ```
 *
 * @fires btrix-selection-change
 */
@localized()
@customElement("btrix-collection-item-list")
export class CollectionItemList extends TailwindElement {
  static styles = css`
    .itemRow {
      cursor: pointer;
    }

    .itemRow::part(base) {
      transition-property: background-color, box-shadow;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      transition-duration: 150ms;
    }

    .itemRow:hover::part(base),
    .itemRow:focus-within::part(base) {
      background-color: var(--sl-color-neutral-50);
    }

    .checkbox + .name::part(base) {
      padding-left: 0;
    }

    btrix-table-cell::part(base) {
      height: 2.5rem;
    }

    btrix-table-cell.name::part(base) {
      min-width: 32em;
    }
  `;

  @property({ type: String })
  collectionId = "";

  @property({ type: Array })
  items: ArchivedItem[] = [];

  @queryAll("btrix-table-row")
  rows!: NodeListOf<TableRow>;

  render() {
    return html`
      <btrix-table class="data-table">
        ${this.collectionId
          ? html`<btrix-table-header-cell slot="head" class="checkbox">
              <span class="sr-only">${msg("Is in Collection?")}</span>
            </btrix-table-header-cell>`
          : nothing}
        <btrix-table-header-cell slot="head" class="name">
          ${msg("Name")}
        </btrix-table-header-cell>
        <btrix-table-header-cell slot="head">
          ${msg("Date Created")}
        </btrix-table-header-cell>
        <btrix-table-header-cell slot="head">
          ${msg("Size")}
        </btrix-table-header-cell>
        <btrix-table-header-cell slot="head">
          ${msg("Created By")}
        </btrix-table-header-cell>
        ${repeat(this.items, ({ id }) => id, this.renderRow)}
      </btrix-table>
    `;
  }

  private renderRow = (item: ArchivedItem) => {
    return html`
      <btrix-table-row
        part="temp"
        class="itemRow"
        tabindex="0"
        @click=${(e: MouseEvent) => {
          (e.currentTarget as TableRow).querySelector("sl-checkbox")?.click();
        }}
      >
        ${this.collectionId ? this.renderCheckbox(item) : nothing}
        <btrix-table-cell class="name">
          ${this.renderName(item)}
        </btrix-table-cell>
        <btrix-table-cell>
          <sl-format-date
            date=${`${item.finished}Z`}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </btrix-table-cell>
        <btrix-table-cell
          ><sl-format-bytes
            value=${item.fileSize || 0}
            display="narrow"
          ></sl-format-bytes
        ></btrix-table-cell>
        <btrix-table-cell><span>${item.userName}</span></btrix-table-cell>
      </btrix-table-row>
    `;
  };

  private renderCheckbox = (item: ArchivedItem) => {
    const isInCollection = item.collectionIds.includes(this.collectionId);
    return html`
      <btrix-table-cell class="checkbox">
        <sl-checkbox
          ?checked=${isInCollection}
          @sl-change=${(e: CustomEvent) => {
            e.stopPropagation();
            this.dispatchEvent(
              new CustomEvent<SelectionChangeDetail>("btrix-selection-change", {
                detail: {
                  selection: {
                    [item.id]: (e.currentTarget as SlCheckbox).checked,
                  },
                },
              })
            );
          }}
        ></sl-checkbox
      ></btrix-table-cell>
    `;
  };

  private renderName(item: ArchivedItem) {
    if (item.name) return html`<span class="truncate">${item.name}</span>`;
    if (item.hasOwnProperty("firstSeed")) {
      const remainder = (item as Crawl).seedCount - 1;
      let nameSuffix: string | TemplateResult<1> = "";
      if (remainder) {
        if (remainder === 1) {
          nameSuffix = html`<span class="additionalUrls"
            >${msg(str`+${remainder} URL`)}</span
          >`;
        } else {
          nameSuffix = html`<span class="additionalUrls"
            >${msg(str`+${remainder} URLs`)}</span
          >`;
        }
      }
      return html`
        <span class="primaryUrl truncate">${(item as Crawl).firstSeed}</span
        >${nameSuffix}
      `;
    }

    return html`<span class="truncate">${msg("(unnamed item)")}</span>`;
  }
}
