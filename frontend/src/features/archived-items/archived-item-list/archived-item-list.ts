import { localized, msg } from "@lit/localize";
import { css, html, nothing, type TemplateResult } from "lit";
import {
  customElement,
  property,
  queryAssignedElements,
  state,
} from "lit/decorators.js";

import type { ArchivedItemListItem } from "./archived-item-list-item";

import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItem } from "@/types/crawler";

/**
 * @example Usage:
 * ```ts
 * <btrix-archived-item-list>
 *   <btrix-archived-item-list-item .item=${item}
 *   ></btrix-archived-item-list-item>
 * </btrix-archived-item-list>
 * ```
 *
 * @slot checkboxCell
 * @slot actionCell
 */
@customElement("btrix-archived-item-list")
@localized()
export class ArchivedItemList extends TailwindElement {
  static styles = css`
    btrix-table {
      --btrix-table-cell-gap: var(--sl-spacing-x-small);
      --btrix-table-cell-padding-x: var(--sl-spacing-small);
    }

    btrix-table-body ::slotted(*:nth-of-type(n + 2)) {
      --btrix-border-top: 1px solid var(--sl-panel-border-color);
    }

    btrix-table-body ::slotted(*:first-of-type) {
      --btrix-border-radius-top: var(--sl-border-radius-medium);
    }

    btrix-table-body ::slotted(*:last-of-type) {
      --btrix-border-radius-bottom: var(--sl-border-radius-medium);
    }
  `;

  @property({ type: String })
  listType: ArchivedItem["type"] | null = null;

  @queryAssignedElements({ selector: "btrix-archived-item-list-item" })
  public items!: ArchivedItemListItem[];

  @state()
  private hasCheckboxCell = false;

  @state()
  private hasActionCell = false;

  render() {
    const headerCols: { cssCol: string; cell: TemplateResult<1> | symbol }[] = [
      {
        cssCol: "min-content",
        cell: html`<btrix-table-header-cell>
          ${msg("Status")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "[clickable-start] 50ch",
        cell: html`<btrix-table-header-cell>
          ${msg("Name")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "1fr",
        cell: html`<btrix-table-header-cell>
          ${msg("Date Created")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "1fr",
        cell: html`<btrix-table-header-cell>
          ${msg("Size")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "1fr",
        cell: html`<btrix-table-header-cell>
          ${msg("Pages")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "1fr",
        cell: html`<btrix-table-header-cell>
          ${msg("QA Analysis Runs")}
        </btrix-table-header-cell>`,
      },
      {
        cssCol: "1fr",
        cell: html`<btrix-table-header-cell>
          ${msg("QA Rating")}
        </btrix-table-header-cell>`,
      },
    ];
    if (this.hasCheckboxCell) {
      headerCols.unshift({
        cssCol: "min-content",
        cell: nothing, // renders into slot
      });
    }
    if (this.hasActionCell) {
      headerCols.push({
        cssCol: "[clickable-end] min-content",
        cell: nothing, // renders into slot
      });
    }

    return html`
      <style>
        btrix-table {
          --btrix-table-grid-template-columns: ${headerCols
            .map(({ cssCol }) => cssCol)
            .join(" ")};
        }
      </style>
      <btrix-overflow-scroll class="-mx-5 part-[content]:px-5">
        <btrix-table>
          <btrix-table-head class="mb-2">
            <slot
              name="checkboxCell"
              @slotchange=${(e: Event) =>
                (this.hasCheckboxCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
            ${headerCols.map(({ cell }) => cell)}
            <slot
              name="actionCell"
              @slotchange=${(e: Event) =>
                (this.hasActionCell =
                  (e.target as HTMLSlotElement).assignedElements().length > 0)}
            ></slot>
          </btrix-table-head>
          <btrix-table-body class="rounded border">
            <slot></slot>
          </btrix-table-body>
        </btrix-table>
      </btrix-overflow-scroll>
    `;
  }
}
