import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { directive } from "lit/directive.js";
import isEqual from "lodash/fp/isEqual";

import { CellDirective } from "./cellDirective";
import type {
  CellEditEventDetail,
  DataGridCell,
  InputElement,
} from "./data-grid-cell";
import type { GridColumn, GridItem, GridRowId } from "./types";

import { TableRow } from "@/components/ui/table/table-row";
import { tw } from "@/utils/tailwind";

export type RowRemoveEventDetail = {
  key?: string;
};

const cell = directive(CellDirective);

/**
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
  editCells = false;

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

  readonly #invalidInputsMap = new Map<
    GridColumn["field"],
    InputElement["validationMessage"]
  >();

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  protected createRenderRoot() {
    const root = super.createRenderRoot();

    // Attach to render root so that `e.target` is table cell
    root.addEventListener(
      "btrix-input",
      (e) => void this.onCellInput(e as CustomEvent<CellEditEventDetail>),
    );
    root.addEventListener(
      "btrix-change",
      (e) => void this.onCellChange(e as CustomEvent<CellEditEventDetail>),
    );

    return root;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      (changedProperties.has("item") || changedProperties.has("editCells")) &&
      this.item &&
      this.editCells
    ) {
      this.setValue(this.item);
      this.commitValue();
    }
  }

  @queryAll("btrix-data-grid-cell")
  private readonly gridCells?: NodeListOf<DataGridCell>;

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

    let removeCell = html``;

    if (this.removable) {
      removeCell = html`
        <btrix-data-grid-cell
          class=${tw`border-l p-0`}
          @keydown=${this.onKeydown}
        >
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
        </btrix-data-grid-cell>
      `;
    }

    return html` ${this.columns.map(this.renderCell)} ${removeCell} `;
  }

  private readonly renderCell = (col: GridColumn, i: number) => {
    const validationMessage = this.#invalidInputsMap.get(col.field);

    return html`
      <sl-tooltip
        ?disabled=${!validationMessage}
        content=${validationMessage || ""}
        hoist
        placement="bottom"
        trigger=${
          // Manually show/hide tooltip of blur/focus
          "manual"
        }
      >
        <btrix-data-grid-cell
          class=${clsx(i > 0 && tw`border-l`, col.editable && `p-0`)}
          .column=${col}
          .item=${this.item}
          ${cell(col)}
          @keydown=${this.onKeydown}
          @focus=${(e: CustomEvent) => {
            e.stopPropagation();

            const tableCell = e.target as DataGridCell;
            const tooltip = tableCell.closest("sl-tooltip");

            if (tooltip?.open) {
              void tooltip.hide();
            }
          }}
          @blur=${(e: CustomEvent) => {
            e.stopPropagation();

            const tableCell = e.target as DataGridCell;
            const tooltip = tableCell.closest("sl-tooltip");

            if (tooltip && !tooltip.disabled) {
              void tooltip.show();
            }
          }}
        ></btrix-data-grid-cell>
      </sl-tooltip>
    `;
  };

  private readonly onKeydown = (e: KeyboardEvent) => {
    console.log(this.gridCells);
    // TODO More complex keyboard navigation

    if (e.composedPath()[0] === e.currentTarget && this.gridCells) {
      const gridCells = Array.from(this.gridCells);
      const i = gridCells.indexOf(e.target as DataGridCell);

      if (i === -1) return;

      if (e.key === "ArrowRight") {
        const nextCell = gridCells[i + 1] || this.gridCells[0];

        if (nextCell) {
          nextCell.focus();
        }
      } else if (e.key === "ArrowLeft") {
        const prevCell =
          gridCells[i - 1] || this.gridCells[this.gridCells.length - 1];

        if (prevCell) {
          prevCell.focus();
        }
      } else if (e.key === "ArrowDown") {
        console.debug("TODO");
      } else if (e.key === "ArrowUp") {
        console.debug("TODO");
      }
    }
  };

  private readonly onCellInput = async (
    e: CustomEvent<CellEditEventDetail>,
  ) => {
    e.stopPropagation();

    const { field, value, validity, validationMessage } = e.detail;
    const tableCell = e.target as DataGridCell;

    if (validity.valid) {
      this.#invalidInputsMap.delete(field);
    } else {
      this.#invalidInputsMap.set(field, validationMessage);
      this.#internals.setValidity(validity, validationMessage, tableCell);
    }

    this.setValue({
      [field]: value.toString(),
    });
  };

  private readonly onCellChange = async (
    e: CustomEvent<CellEditEventDetail>,
  ) => {
    e.stopPropagation();

    const { field, validity, validationMessage } = e.detail;
    const tableCell = e.target as DataGridCell;

    if (validity.valid) {
      this.#invalidInputsMap.delete(field);
    } else {
      this.#invalidInputsMap.set(field, validationMessage);
      this.#internals.setValidity(validity, validationMessage, tableCell);
    }

    this.commitValue();

    await this.updateComplete;
    await tableCell.input?.updateComplete;

    if (validity.valid) {
      const firstInvalid = Array.from(this.gridCells || []).find((cell) =>
        cell.validity?.valid ? false : cell,
      );

      if (firstInvalid?.validity && firstInvalid.validationMessage) {
        this.#internals.setValidity(
          firstInvalid.validity,
          firstInvalid.validationMessage,
          firstInvalid,
        );
      } else {
        this.#internals.setValidity({});
      }
    }
  };
}
