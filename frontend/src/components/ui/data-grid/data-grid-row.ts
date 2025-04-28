import { localized, msg } from "@lit/localize";
import type { SlInput, SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { ref } from "lit/directives/ref.js";
import isEqual from "lodash/fp/isEqual";

import type {
  GridColumn,
  GridColumnSelectType,
  GridItem,
  GridRowId,
} from "./types";
import { GridColumnType } from "./types";

import type { TableCell } from "@/components/ui/table/table-cell";
import { TableRow } from "@/components/ui/table/table-row";
import type { UrlInput } from "@/components/ui/url-input";
import { tw } from "@/utils/tailwind";

export type CellEditEventDetail = {
  field: string;
  value: string | string[];
  valid: boolean;
};
export type RowRemoveEventDetail = {
  key?: string;
};

type InputElement = SlInput | SlSelect | UrlInput;

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
  readonly #internals: ElementInternals;

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
  @property({ type: Object, hasChanged: (a, b) => !isEqual(a, b) })
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
  private cellValues: Partial<GridItem> = {};

  public formAssociatedCallback() {
    console.debug("form associated");
  }

  public formResetCallback() {
    this.setValue(this.item || {});
    this.commitValue();
  }

  public formDisabledCallback(disabled: boolean) {
    console.debug("form disabled:", disabled);
  }

  public formStateRestoreCallback(state: string | FormData, reason: string) {
    console.debug("formStateRestoreCallback:", state, reason);
  }

  public checkValidity(): boolean {
    return this.#internals.checkValidity();
  }

  public reportValidity(): void {
    this.#internals.reportValidity();
  }

  public get validity(): ValidityState {
    return this.#internals.validity;
  }

  public get validationMessage(): string {
    return this.#internals.validationMessage;
  }

  readonly #invalidInputsMap = new Map<GridColumn["field"], InputElement>();

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      (changedProperties.has("item") || changedProperties.has("editable")) &&
      this.item &&
      this.editable
    ) {
      this.setValue(this.item);
      this.commitValue();
    }
  }

  private readonly onInputRefForField =
    (field: GridColumn["field"]) => async (el: Element | undefined) => {
      if (!el) return;

      const input = el as InputElement;
      await input.updateComplete;
      await this.updateComplete;

      const valid = input.checkValidity();

      if (valid) {
        this.#invalidInputsMap.delete(field);
      } else {
        this.#invalidInputsMap.set(field, input);
      }

      if (this.#invalidInputsMap.size) {
        // Check all fields so that invalid element can be refocused
        const firstInvalidField = this.#invalidInputsMap.keys().next()
          .value as string;

        const input = this.#invalidInputsMap.get(firstInvalidField);

        if (!input) {
          console.debug("no input for field:", field);
          return;
        }

        const tableCell = input.closest<TableCell>("btrix-table-cell");
        const args: Parameters<ElementInternals["setValidity"]> = [
          input.validity,
          input.validationMessage,
        ];

        if (tableCell) {
          args.push(tableCell);
        }

        this.#internals.setValidity(...args);
      } else {
        this.#internals.setValidity({});
      }
    };

  private setValue(cellValues: Partial<GridItem>) {
    Object.keys(cellValues).forEach((field) => {
      this.cellValues[field] = cellValues[field];
    });

    this.#internals.setFormValue(JSON.stringify(this.cellValues));
  }

  private commitValue() {
    this.cellValues = {
      ...this.cellValues,
    };
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

          const invalidInput = this.#invalidInputsMap.get(col.field);

          // TODO Clean up events
          return html`
            <sl-tooltip
              ?disabled=${!invalidInput}
              content=${ifDefined(invalidInput?.validationMessage)}
              hoist
              placement="bottom"
              trigger="hover"
            >
              <btrix-table-cell
                class=${clsx(i > 0 && tw`border-l`, tw`p-0`)}
                tabindex="0"
                @sl-input=${onCellInput}
                @btrix-input=${onCellInput}
                @sl-change=${onCellChange}
                @btrix-change=${onCellChange}
              >
                ${col.renderEditCell
                  ? col.renderEditCell({
                      item: item,
                      refCallback: this.onInputRefForField(col.field),
                    })
                  : this.renderEditCell(col)}
              </btrix-table-cell>
            </sl-tooltip>
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
    const value = this.cellValues[col.field] ?? "";

    switch (col.inputType) {
      case GridColumnType.Select: {
        return html`
          <div class="box-border w-full p-1">
            <sl-select
              ${ref(this.onInputRefForField(col.field))}
              name=${col.field}
              value=${value}
              placeholder=${ifDefined(col.inputPlaceholder)}
              class="w-full"
              size="small"
              ?required=${col.required}
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
          ${ref(this.onInputRefForField(col.field))}
          name=${col.field}
          class=${clsx(cellInputStyle, inputStyle)}
          value=${value}
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
        ${ref(this.onInputRefForField(col.field))}
        name=${col.field}
        class=${clsx(cellInputStyle, inputStyle)}
        type=${col.inputType === GridColumnType.Number ? "number" : "text"}
        value=${value}
        placeholder=${ifDefined(col.inputPlaceholder)}
        ?required=${col.required}
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

      const tableCell = e.currentTarget as TableCell;
      const input = e.target as InputElement;
      const value = input.value;

      this.setValue({
        [field]: value as string,
      });

      if (input.validity.valid) {
        this.#invalidInputsMap.delete(field);
      } else {
        this.#invalidInputsMap.set(field, input);

        if (this.#internals.validity.valid) {
          this.#internals.setValidity(
            input.validity,
            input.validationMessage,
            tableCell as HTMLElement,
          );
        }
      }

      if (!this.#invalidInputsMap.size) {
        this.#internals.setValidity({});
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

      const input = e.target as HTMLInputElement;
      const value = input.value;

      this.commitValue();
      this.dispatchEvent(
        new CustomEvent<CellEditEventDetail>("btrix-change", {
          detail: { field, value, valid: input.validity.valid },
        }),
      );
    };
}
