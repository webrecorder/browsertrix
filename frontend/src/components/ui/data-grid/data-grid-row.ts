import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import type {
  GridColumn,
  GridColumnSelectType,
  GridItem,
  GridRowId,
} from "./types";
import { GridColumnType } from "./types";

import type { TableCell } from "@/components/ui/table/table-cell";
import { TableRow } from "@/components/ui/table/table-row";
import { tw } from "@/utils/tailwind";

export type CellEditEventDetail = {
  field: string;
  value: string;
  valid: boolean;
};
export type RowRemoveEventDetail = {
  key?: string;
};

export const cellInputStyle = [
  tw`size-full [--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)] focus:z-10`,
  tw`data-[invalid]:[--sl-input-border-color:transparent] data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
  tw`part-[input]:px-[var(--sl-spacing-x-small)]`,
];

/**
 * @fires btrix-input CustomEvent<CellEventDetail>
 * @fires btrix-change CustomEvent<CellEventDetail>
 * @fires btrix-remove CustomEvent<RowRemoveEventDetail>
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
  columns?: GridColumn[] = [];

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
   * Whether the row can be removed.
   */
  @property({ type: Boolean })
  removable = false;

  /**
   * Whether cells can be edited.
   */
  @property({ type: Boolean })
  editable = false;

  /**
   * Form control name, if used in a form.
   */
  @property({ type: String, reflect: true })
  name?: string;

  /**
   * Make row focusable on validation.
   */
  @property({ type: Number, reflect: true })
  tabindex = 0;

  @state()
  private formEnabled = true;

  public formAssociatedCallback() {
    this.formEnabled = true;
  }

  public formResetCallback() {
    this.setValue(this.item || {});
  }

  public formDisabledCallback(isDisabled: boolean) {
    this.formEnabled = !isDisabled;
  }

  public formStateRestoreCallback(state: string | FormData, reason: string) {
    console.debug("formStateRestoreCallback:", state, reason);
  }

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

  readonly #valueMap: Partial<GridItem> = {};
  readonly #validityMap = new Map<GridColumn["field"], ValidityStateFlags>();

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      (changedProperties.has("item") || changedProperties.has("formEnabled")) &&
      this.item &&
      this.editable &&
      this.formEnabled
    ) {
      this.setValue(this.item);

      this.columns?.forEach((col) => {
        if (col.required && !this.#valueMap[col.field]) {
          this.#validityMap.set(col.field, {
            valueMissing: true,
          });
        }
      });
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    if (changedProperties.has("formEnabled") && this.formEnabled && this.item) {
      // TODO Check why form becomes null
      console.log("formEnabled form:", this.#internals?.form);

      if (this.#internals?.form) {
        this.setValue(this.item);
      }
    }
  }

  private setValue(cellValues: Partial<GridItem>) {
    Object.keys(cellValues).forEach((field) => {
      this.#valueMap[field] = cellValues[field];
    });

    if (this.#internals?.form) {
      this.#internals.setFormValue(JSON.stringify(this.#valueMap));
      console.debug("form data:", new FormData(this.#internals.form));
    } else {
      console.debug("no form, cannot save", cellValues);
    }
  }

  render() {
    if (!this.columns?.length) return html``;

    const item = this.item || {};

    let renderCell = (col: GridColumn, i: number) => html`
      <btrix-table-cell class=${clsx(i > 0 && tw`border-l`)}>
        ${this.renderCell(col)}
      </btrix-table-cell>
    `;
    let removeCell = html``;

    if (this.editable) {
      const renderReadonlyCell = renderCell;

      renderCell = (col: GridColumn, i: number) => {
        if (col.editable) {
          const onCellInput = this.onInputForField(col.field);
          const onCellChange = this.onChangeForField(col.field);

          // TODO Clean up events
          return html`
            <btrix-table-cell
              class=${clsx(i > 0 && tw`border-l`, tw`p-0`)}
              tabindex="0"
              @sl-input=${onCellInput}
              @btrix-input=${onCellInput}
              @sl-change=${onCellChange}
              @btrix-change=${onCellChange}
            >
              ${col.renderEditCell
                ? col.renderEditCell({ item: item })
                : this.renderEditCell(col)}
            </btrix-table-cell>
          `;
        }

        return renderReadonlyCell(col, i);
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
                this.dispatchEvent(
                  new CustomEvent<RowRemoveEventDetail>("btrix-remove", {
                    detail: {
                      key: this.key,
                    },
                    bubbles: true,
                    composed: true,
                  }),
                )}
            ></sl-icon-button>
          </sl-tooltip>
        </btrix-table-cell>
      `;
    }

    return html` ${this.columns.map(renderCell)} ${removeCell} `;
  }

  private renderEditCell(col: GridColumn) {
    const inputStyle = tw`part-[base]:h-full part-[form-control-input]:h-full part-[form-control]:h-full part-[input]:h-full`;
    const value = this.item?.[col.field] ?? "";

    switch (col.inputType) {
      case GridColumnType.Select: {
        return html`
          <div class="box-border w-full p-1">
            <sl-select
              value=${value}
              placeholder=${ifDefined(col.inputPlaceholder)}
              class="w-full"
              size="small"
              ?required=${col.required}
              ?disabled=${!this.formEnabled}
              hoist
            >
              <!-- TODO Cache -->
              ${(col as GridColumnSelectType).renderSelectOptions()}
            </sl-select>
          </div>
        `;
      }
      case GridColumnType.URL:
        return html`<btrix-url-input
          class=${clsx(cellInputStyle, inputStyle)}
          value=${value}
          placeholder=${ifDefined(col.inputPlaceholder)}
          ?required=${col.required}
          ?disabled=${!this.formEnabled}
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
        value=${value}
        placeholder=${ifDefined(col.inputPlaceholder)}
        ?required=${col.required}
        ?disabled=${!this.formEnabled}
      ></sl-input>
    `;
  }

  private renderCell(col: GridColumn) {
    if (!this.item) return "";

    if (col.renderCell) {
      return col.renderCell({ item: this.item });
    }

    return this.item[col.field] ?? "";
  }

  private readonly onInputForField =
    (field: GridColumn["field"]) => (e: CustomEvent) => {
      e.stopPropagation();

      // TODO Better typing for any form element
      const input = e.target as HTMLInputElement;
      const value = input.value;

      this.setValue({
        [field]: value,
      });

      if (input.validity.valid) {
        this.#validityMap.delete(field);
      } else {
        this.#validityMap.set(field, input.validity);
      }

      this.dispatchEvent(
        new CustomEvent<CellEditEventDetail>("btrix-input", {
          detail: { field, value, valid: input.validity.valid },
        }),
      );
    };

  private readonly onChangeForField =
    (field: GridColumn["field"]) => (e: CustomEvent) => {
      e.stopPropagation();

      const tableCell = e.currentTarget as TableCell;
      // TODO Better typing for any form element
      const input = e.target as HTMLInputElement;
      const value = input.value;

      if (this.#validityMap.size) {
        this.#internals?.setValidity(
          input.validity,
          input.validationMessage,
          tableCell as HTMLElement,
        );
      } else {
        this.#internals?.setValidity({});
      }

      this.dispatchEvent(
        new CustomEvent<CellEditEventDetail>("btrix-change", {
          detail: { field, value, valid: input.validity.valid },
        }),
      );
    };
}
