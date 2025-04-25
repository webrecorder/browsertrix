import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import type { EmptyObject } from "type-fest";

import type { DataGridRow, RowRemoveEventDetail } from "./data-grid-row";
import { DataGridController } from "./dataGridController";
import type { GridColumn, GridItem } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * Data grids structure data into rows and and columns.
 *
 * @slot label
 * @slot rows
 * @fires btrix-change
 */
@customElement("btrix-data-grid")
@localized()
export class DataGrid extends TailwindElement {
  static styles = css`
    :host {
      --border: 1px solid var(--sl-panel-border-color);
    }

    btrix-data-grid-row:not(:first-of-type),
    btrix-table-body ::slotted(*:nth-of-type(n + 2)) {
      border-top: var(--border) !important;
    }

    btrix-data-grid-row,
    btrix-table-body ::slotted(btrix-data-grid-row) {
      /* TODO Support different input sizes */
      min-height: calc(var(--sl-input-height-medium) + 1px);
    }
  `;

  /**
   * Set of columns.
   */
  @property({ type: Array })
  columns?: GridColumn[] = [];

  /**
   * Set of data to be presented as rows.
   */
  @property({ type: Array })
  items: GridItem[] = [];

  /**
   * Stick header row to the top of the viewport.
   */
  @property({ type: Boolean })
  stickyHeader = false;

  /**
   * Whether rows can be added and removed.
   */
  @property({ type: Boolean })
  editRows = false;

  /**
   * Whether cells can be edited.
   */
  @property({ type: Boolean })
  editCells = false;

  /**
   * Default item for new rows.
   */
  @property({ type: Object })
  defaultItem?: EmptyObject | GridItem = {};

  /**
   * Text for form control label. Use slot to include markup.
   */
  @property({ type: String })
  formControlLabel?: string;

  /**
   * Make grid focusable on validation.
   */
  @property({ type: Number, reflect: true })
  tabindex = 0;

  readonly #dataGridController = new DataGridController(this);

  render() {
    if (!this.columns?.length) return;

    const cssWidths = this.columns.map((col) => col.width ?? "1fr");

    return html`
      <slot name="label">
        <label class="form-label text-xs">${this.formControlLabel}</label>
      </slot>

      <btrix-table
        class=${clsx(
          tw`relative size-full`,
          this.stickyHeader && tw`rounded border`,
        )}
        style="--btrix-table-grid-template-columns: ${cssWidths.join(" ")}${this
          .editRows
          ? " max-content"
          : ""}"
      >
        <btrix-table-head
          class=${clsx(
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            this.stickyHeader
              ? tw`sticky top-0 z-10 rounded-t-[0.1875rem] border-b bg-neutral-50 [&>*:not(:first-of-type)]:border-l`
              : tw`px-px`,
          )}
        >
          ${this.columns.map(
            (col) => html`
              <btrix-table-header-cell style=""
                >${col.label}</btrix-table-header-cell
              >
            `,
          )}
          ${this.editRows
            ? html`<btrix-table-header-cell>
                <span class="sr-only">${msg("Remove")}</span>
              </btrix-table-header-cell>`
            : nothing}
        </btrix-table-head>
        <btrix-table-body
          class=${clsx(
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            tw`leading-none`,
            // TODO Fix input ring not visible with overflow-auto
            // tw`overflow-auto`,
            !this.stickyHeader && tw`rounded border`,
          )}
          @btrix-remove=${(e: CustomEvent<RowRemoveEventDetail>) => {
            console.log("remove item:", e.detail);

            e.stopPropagation();
            const { key } = e.detail;

            if (key) {
              this.#dataGridController.removeRow(key);
            } else {
              console.warn("Could not remove row without key or item");
            }
          }}
        >
          ${this.renderRows()}
        </btrix-table-body>
      </btrix-table>

      ${this.editRows ? this.renderAddButton() : nothing}
    `;
  }

  private renderRows() {
    return html`
      <slot name="rows" class="contents" @slotchange=${this.onRowSlotChange}>
        ${repeat(
          this.#dataGridController.rows,
          ([id]) => id,
          ([id, item]) => html`
            <btrix-data-grid-row
              key=${id}
              .item=${item}
              .columns=${this.columns}
              ?removable=${this.editRows}
              ?editable=${this.editCells}
            ></btrix-data-grid-row>
          `,
        )}
      </slot>
    `;
  }

  private readonly renderAddButton = () => {
    return html`<footer class="mt-2">
      <sl-button
        size="small"
        @click=${() => this.#dataGridController.addRow(this.defaultItem || {})}
      >
        <sl-icon slot="prefix" name="plus-lg"></sl-icon>
        <span class="text-neutral-600">${msg("Add More")}</span>
      </sl-button>
    </footer>`;
  };

  private readonly onRowSlotChange = (e: Event) => {
    const rows = (e.target as HTMLSlotElement).assignedElements();
    const assignProp = (
      el: Element,
      { name, value }: { name: keyof DataGridRow; value: string | boolean },
    ) => {
      if (el.attributes.getNamedItem(name)) return;

      if (typeof value === "boolean") {
        if (value) {
          el.setAttribute(name, "true");
        } else {
          el.removeAttribute(name);
        }
      } else {
        el.setAttribute(name, value);
      }
    };

    const removable = this.editRows;
    const editable = this.editCells;

    rows.forEach((el) => {
      assignProp(el, { name: "removable", value: removable });
      assignProp(el, { name: "editable", value: editable });

      (el as DataGridRow)["columns"] = this.columns;
    });
  };
}
