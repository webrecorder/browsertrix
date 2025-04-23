import { localized, msg } from "@lit/localize";
import type { SlInput, SlInputEvent } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { repeat } from "lit/directives/repeat.js";
import { nanoid } from "nanoid";

import type {
  GridColumn,
  GridColumnSelectType,
  GridItem,
  GridRowId,
  GridRows,
} from "./types";
import { GridColumnType } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

export const inputStyle = [
  tw`w-full [--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-color-hover:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)] focus:z-10`,
  tw`data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
  tw`part-[input]:px-[var(--sl-spacing-x-small)]`,
];

/**
 * @slot label
 * @attr name
 * @fires btrix-change
 */
@customElement("btrix-data-grid")
@localized()
export class DataGrid extends TailwindElement {
  // TODO Abstract to mixin or decorator
  static formAssociated = true;
  readonly #internals?: ElementInternals;

  /**
   * Set of columns.
   */
  @property({ type: Array })
  columns: GridColumn[] = [];

  /**
   * Set of data to be presented as rows.
   */
  @property({ type: Array })
  items: GridItem[] = [];

  /**
   * Key to use as row ID. Defaults to one generated with nanoid.
   * See [repeat directive](https://lit.dev/docs/api/directives/#repeat) for details.
   */
  @property({ type: String })
  repeatKey?: string;

  @property({ type: Boolean })
  stickyHeader = false;

  /**
   * Text for form label. Use slot to include markup.
   */
  @property({ type: String })
  label?: string;

  /**
   * Whether rows can be added and removed
   */
  @property({ type: Boolean })
  editRows = false;

  /**
   * Whether cells can be edited
   */
  @property({ type: Boolean })
  editCells = false;

  @state()
  private rows: GridRows = new Map();

  public itemsToValue = (items: GridItem[]) => JSON.stringify(items);
  public valueToItems = (value: string): unknown => JSON.parse(value);

  public checkValidity(): boolean | null {
    return this.#internals?.checkValidity() ?? null;
  }

  public reportValidity(): void {
    this.#internals?.reportValidity();
  }

  public get validity(): ValidityState | null {
    return this.#internals?.validity ?? null;
  }

  public get validationMessage(): string | null {
    return this.#internals?.validationMessage ?? null;
  }

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items") || changedProperties.has("editRows")) {
      this.setRowsFromItems(this.items);
      this.setValueFromItems(this.items);
    } else if (changedProperties.has("rows")) {
      this.setValueFromRows(this.rows);
    }
  }

  private setRowsFromItems(items: GridItem[]) {
    if (this.editRows && !items.length) {
      this.addRow();
    } else {
      const repeatKey = this.repeatKey;

      if (repeatKey) {
        this.rows = new Map(
          items.map((item) => [item[repeatKey] as string, item]),
        );
      } else {
        this.rows = new Map(items.map((item) => [nanoid(), item]));
      }
    }
  }

  private setValueFromItems(items: GridItem[]) {
    if (!this.#internals?.form) return;

    this.#internals.setFormValue(this.itemsToValue(items));
  }

  private setValueFromRows(rows: GridRows) {
    if (!this.#internals?.form) return;

    this.setValueFromItems(Array.from(rows.values()));
    void this.dispatchChange();
  }

  render() {
    const renderRow = this.renderRowForEditMode();

    return html`
      <slot name="label">
        <label class="form-label text-xs">${this.label}</label>
      </slot>

      <btrix-table
        class=${clsx(
          tw`relative size-full`,
          this.stickyHeader && tw`rounded border`,
        )}
        style=${this.editRows
          ? `--btrix-table-grid-template-columns: repeat(${this.columns.length}, auto) max-content`
          : ""}
      >
        <btrix-table-head
          class=${clsx(
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            this.stickyHeader &&
              tw`sticky top-0 z-10 rounded-t-[0.1875rem] border-b bg-neutral-50 [&>*:not(:first-child)]:border-l`,
          )}
        >
          ${this.columns.map(
            (col) => html`
              <btrix-table-header-cell>${col.label}</btrix-table-header-cell>
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
            tw`leading-none [&>*:not(:first-child)]:border-t [&>*>*:not(:first-child)]:border-l`,
            // TODO Support different input sizes
            tw`*:min-h-[calc(var(--sl-input-height-medium)+1px)]`,
            // TODO Fix input ring not visible with overflow-auto
            // tw`overflow-auto`,
            !this.stickyHeader && tw`rounded border`,
          )}
        >
          ${repeat(
            this.rows,
            ([id]) => id,
            (row) => renderRow(...row),
          )}
        </btrix-table-body>
      </btrix-table>

      ${this.editRows ? this.renderAddButton() : nothing}
    `;
  }

  private readonly renderAddButton = () => {
    return html`<footer class="mt-3">
      <sl-button @click=${this.addRow}>${msg("Add More")}</sl-button>
    </footer>`;
  };

  private readonly renderRowForEditMode = () => {
    const renderTableCell = (item: GridItem, col: GridColumn) => html`
      <btrix-table-cell>
        ${col.renderCell ? col.renderCell({ item }) : item[col.field]}
      </btrix-table-cell>
    `;

    let renderCellForItem =
      (_id: GridRowId, item: GridItem) => (col: GridColumn) =>
        renderTableCell(item, col);

    if (this.editCells) {
      renderCellForItem =
        (id: GridRowId, item: GridItem) => (col: GridColumn) =>
          col.editable
            ? html`
                <btrix-table-cell class="p-0">
                  ${col.renderEditCell
                    ? col.renderEditCell({ item })
                    : this.renderEditCell(id, item, col)}
                </btrix-table-cell>
              `
            : renderTableCell(item, col);
    }

    if (this.editRows) {
      return (id: GridRowId, item: GridItem) => html`
        <btrix-table-row>
          ${this.columns.map(renderCellForItem(id, item))}

          <btrix-table-cell class="p-0">
            <sl-tooltip content=${msg("Remove")}>
              <sl-icon-button
                class="p-1 text-base hover:text-danger"
                name="trash3"
                @click=${() => this.removeRow(id)}
              ></sl-icon-button>
            </sl-tooltip>
          </btrix-table-cell>
        </btrix-table-row>
      `;
    }

    return (id: GridRowId, item: GridItem) => html`
      <btrix-table-row>
        ${this.columns.map(renderCellForItem(id, item))}
      </btrix-table-row>
    `;
  };

  private renderEditCell(rowId: GridRowId, item: GridItem, col: GridColumn) {
    switch (col.inputType) {
      case GridColumnType.Select: {
        return html`
          <div class="box-border w-full p-1">
            <sl-select
              value=${item[col.field] ?? ""}
              placeholder=${ifDefined(col.inputPlaceholder)}
              class="w-full"
              size="small"
              hoist
            >
              ${(col as GridColumnSelectType).renderSelectOptions()}
            </sl-select>
          </div>
        `;
      }
      case GridColumnType.URL:
        return html`<btrix-url-input
          class=${clsx(inputStyle)}
          value=${item[col.field] ?? ""}
          placeholder=${ifDefined(col.inputPlaceholder)}
        >
        </btrix-url-input>`;
      default:
        break;
    }

    return html`
      <sl-input
        class=${clsx(inputStyle)}
        type=${col.inputType === GridColumnType.Number ? "number" : "text"}
        value=${item[col.field] ?? ""}
        placeholder=${ifDefined(col.inputPlaceholder)}
        @sl-change=${() => void this.dispatchChange()}
        @sl-input=${this.onInput(rowId, col.field)}
      ></sl-input>
    `;
  }

  private addRow() {
    const id = nanoid();

    this.rows = new Map(this.rows.set(id, {}));
  }

  private removeRow(id: GridRowId) {
    this.rows.delete(id);

    if (this.rows.size === 0 && this.editRows) {
      this.addRow();
    } else {
      this.rows = new Map(this.rows);
    }

    this.setValueFromRows(this.rows);
  }

  private readonly onInput =
    (id: string, field: GridColumn["field"]) => (e: SlInputEvent) => {
      const input = e.target as SlInput;

      const rows = new Map(this.rows);
      rows.set(id, {
        ...rows.get(id),
        [field]: input.value,
      });

      this.setValueFromRows(rows);
    };

  private readonly dispatchChange = async () => {
    await this.updateComplete;

    this.dispatchEvent(new CustomEvent("btrix-change"));
  };
}
