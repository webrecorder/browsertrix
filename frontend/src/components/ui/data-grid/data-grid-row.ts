import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import type {
  GridColumn,
  GridColumnSelectType,
  GridItem,
  GridRowId,
} from "./types";
import { GridColumnType } from "./types";

import { TableRow } from "@/components/ui/table/table-row";
import { tw } from "@/utils/tailwind";

export type CellEventDetail = {
  field: string;
  value: string;
  valid: boolean;
};

export const cellInputStyle = [
  tw`size-full [--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)] focus:z-10`,
  tw`data-[invalid]:[--sl-input-border-color:transparent] data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
  tw`part-[input]:px-[var(--sl-spacing-x-small)]`,
];

/**
 * @attr name
 * @fires btrix-input CustomEvent<CellEventDetail>
 * @fires btrix-change CustomEvent<CellEventDetail>
 * @fires btrix-remove
 */
@customElement("btrix-data-grid-row")
@localized()
export class DataGridRow extends TableRow {
  // TODO Abstract to mixin or decorator
  static formAssociated = true;
  readonly #internals?: ElementInternals;

  /**
   * Set of columns.
   */
  @property({ type: Array })
  columns: GridColumn[] = [];

  /**
   * Row key/ID.
   */
  @property({ type: String })
  key?: GridRowId;

  /**
   * Data to be presented as a row.
   */
  @property({ type: Object })
  item?: GridItem;

  /**
   * Whether row can be removed
   */
  @property({ type: Boolean })
  removable = false;

  /**
   * Whether cells can be edited
   */
  @property({ type: Boolean })
  editCells = false;

  /**
   * Make row focusable on validation.
   */
  @property({ type: Number, reflect: true })
  tabindex = 0;

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

  readonly #validityMap = new Map<
    GridColumn["field"],
    HTMLInputElement["validationMessage"]
  >();

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  render() {
    if (!this.key || !this.item) return html``;

    const item = this.item;

    let renderCell = (col: GridColumn, i: number) => html`
      <btrix-table-cell class=${clsx(i > 0 && tw`border-l`)}>
        ${this.renderCell(col)}
      </btrix-table-cell>
    `;
    let removeCell = html``;

    if (this.editCells) {
      renderCell = (col: GridColumn, i: number) => {
        if (col.editable) {
          const onCellInput = this.onInputForField(col.field);
          const onCellChange = this.onChangeForField(col.field);

          // TODO Clean up events
          return html`
            <btrix-table-cell
              class=${clsx(i > 0 && tw`border-l`, tw`p-0`)}
              @sl-input=${onCellInput}
              @btrix-input=${onCellInput}
              @sl-change=${onCellChange}
              @btrix-change=${onCellChange}
            >
              <sl-tooltip content="TODO Error" hoist placement="bottom">
                ${col.renderEditCell
                  ? col.renderEditCell({ item: item })
                  : this.renderEditCell(col)}
              </sl-tooltip>
            </btrix-table-cell>
          `;
        }

        return html`${this.renderCell(col)}`;
      };
    }

    if (this.removable) {
      removeCell = html`
        <btrix-table-cell class=${tw`border-l p-0`}>
          <sl-tooltip content=${msg("Remove")}>
            <sl-icon-button
              class="p-1 text-base hover:text-danger"
              name="trash3"
              @click=${() =>
                this.dispatchEvent(new CustomEvent("btrix-remove"))}
            ></sl-icon-button>
          </sl-tooltip>
        </btrix-table-cell>
      `;
    }

    return html` ${this.columns.map(renderCell)} ${removeCell} `;
  }

  private renderEditCell(col: GridColumn) {
    const inputStyle = tw`part-[base]:h-full part-[form-control-input]:h-full part-[form-control]:h-full part-[input]:h-full`;

    switch (col.inputType) {
      case GridColumnType.Select: {
        return html`
          <div class="box-border w-full p-1">
            <sl-select
              value=${this.item![col.field] ?? ""}
              placeholder=${ifDefined(col.inputPlaceholder)}
              class="w-full"
              size="small"
              ?required=${col.required}
              hoist
            >
              ${(col as GridColumnSelectType).renderSelectOptions()}
            </sl-select>
          </div>
        `;
      }
      case GridColumnType.URL:
        return html`<btrix-url-input
          class=${clsx(cellInputStyle, inputStyle)}
          value=${this.item![col.field] ?? ""}
          placeholder=${ifDefined(col.inputPlaceholder)}
          ?required=${col.required}
          hideHelpText
        >
        </btrix-url-input>`;
      default:
        break;
    }

    return html`
      <sl-input
        class=${clsx(cellInputStyle, inputStyle)}
        type=${col.inputType === GridColumnType.Number ? "number" : "text"}
        value=${this.item![col.field] ?? ""}
        placeholder=${ifDefined(col.inputPlaceholder)}
        ?required=${col.required}
      ></sl-input>
    `;
  }

  private renderCell(col: GridColumn) {
    if (col.renderCell) {
      return col.renderCell({ item: this.item! });
    }

    return this.item![col.field];
  }

  private readonly onInputForField =
    (field: GridColumn["field"]) => (e: CustomEvent) => {
      e.stopPropagation();

      // TODO Better typing for any form element
      const input = e.target as HTMLInputElement;
      const value = input.value;

      if (input.validity.valid) {
        this.#validityMap.delete(field);
      } else {
        this.#validityMap.set(field, input.validationMessage);
      }

      if (this.#validityMap.size) {
        this.#internals?.setValidity(
          { customError: true },
          msg("Please address all issues in this row."),
          // TODO Check why anchor doesn't work
          // input
        );
      } else {
        this.#internals?.setValidity({});
      }

      this.dispatchEvent(
        new CustomEvent<CellEventDetail>("btrix-input", {
          detail: { field, value, valid: input.validity.valid },
        }),
      );
    };

  private readonly onChangeForField =
    (field: GridColumn["field"]) => (e: CustomEvent) => {
      e.stopPropagation();

      // TODO Better typing for any form element
      const input = e.target as HTMLInputElement;
      const value = input.value;

      this.dispatchEvent(
        new CustomEvent<CellEventDetail>("btrix-change", {
          detail: { field, value, valid: input.validity.valid },
        }),
      );
    };
}
