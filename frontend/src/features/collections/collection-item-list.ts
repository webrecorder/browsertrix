import { type TemplateResult, LitElement, html, css } from "lit";
import { customElement, property, queryAll } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { type SlCheckbox } from "@shoelace-style/shoelace";

import type { ArchivedItem } from "@/types/crawler";
import type { TableRow } from "@/components/ui/table/table-row";

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
export class CollectionItemList extends LitElement {
  static styles = css`
    :host {
      --border: var(--sl-panel-border-width) solid var(--sl-panel-border-color);
    }

    btrix-table-header-cell {
      color: var(--sl-color-neutral-700);
      font-size: var(--sl-font-size-x-small);
      line-height: 1;
    }

    btrix-table-header-cell::part(base) {
      padding-bottom: var(--sl-spacing-x-small);
    }

    btrix-table-cell::part(base) {
      height: 2.5rem;
    }

    btrix-table::part(body) {
      border: var(--border);
      border-radius: var(--sl-border-radius-medium);
      color: var(--sl-color-neutral-900);
    }

    .itemRow {
      cursor: pointer;
    }

    .itemRow::part(base) {
      transition-property: background-color, box-shadow;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      transition-duration: 150ms;
    }

    .itemRow:nth-of-type(n + 2)::part(base) {
      border-top: var(--border);
    }

    .itemRow:hover::part(base),
    .itemRow:focus-within::part(base) {
      background-color: var(--sl-color-neutral-50);
    }

    btrix-table-cell::part(base) {
      display: flex;
      align-items: center;
    }

    .checkbox::part(base) {
      padding: var(--sl-spacing-small);
    }

    .checkbox sl-checkbox {
      display: flex;
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
      <btrix-table>
        <btrix-table-header-cell slot="head"></btrix-table-header-cell>
        <btrix-table-header-cell slot="head"
          >${msg("Name")}</btrix-table-header-cell
        >
        <btrix-table-header-cell slot="head"
          >${msg("Date Created")}</btrix-table-header-cell
        >
        <btrix-table-header-cell slot="head"
          >${msg("Size")}</btrix-table-header-cell
        >
        <btrix-table-header-cell slot="head"
          >${msg("Created By")}</btrix-table-header-cell
        >
        ${this.items.map(this.renderRow)}
      </btrix-table>
    `;
  }

  private renderRow = (item: ArchivedItem) => {
    const isInCollection = item.collectionIds.includes(this.collectionId);
    return html`
      <btrix-table-row
        class="itemRow"
        tabindex="0"
        @click=${(e: MouseEvent) => {
          (e.currentTarget as TableRow).querySelector("sl-checkbox")?.click();
        }}
      >
        <btrix-table-cell class="checkbox">
          <sl-checkbox
            ?checked=${isInCollection}
            @sl-change=${(e: CustomEvent) => {
              e.stopPropagation();
              this.dispatchEvent(
                new CustomEvent<SelectionChangeDetail>(
                  "btrix-selection-change",
                  {
                    detail: {
                      selection: {
                        [item.id]: (e.currentTarget as SlCheckbox).checked,
                      },
                    },
                  }
                )
              );
            }}
          ></sl-checkbox
        ></btrix-table-cell>
        <btrix-table-cell class="name">
          ${this.renderName(item)}</btrix-table-cell
        >
        <btrix-table-cell
          ><sl-format-date
            date=${`${item.finished}Z`}
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date
        ></btrix-table-cell>
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

  private renderName(item: ArchivedItem) {
    if (item.name) return html`<span class="truncate">${item.name}</span>`;
    return html`<span class="truncate">${msg("(unnamed item)")}</span>`;
  }
}
