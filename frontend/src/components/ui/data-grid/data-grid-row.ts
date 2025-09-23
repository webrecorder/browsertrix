import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { directive } from "lit/directive.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import isEqual from "lodash/fp/isEqual";

import { CellDirective } from "./cellDirective";
import type {
  CellEditEventDetail,
  DataGridCell,
  InputElement,
} from "./data-grid-cell";
import type { GridColumn, GridItem, GridRowId } from "./types";

import { DataGridFocusController } from "@/components/ui/data-grid/controllers/focus";
import { TableRow } from "@/components/ui/table/table-row";
import { FormControl } from "@/mixins/FormControl";
import { tw } from "@/utils/tailwind";

export type RowRemoveEventDetail = {
  key?: string;
};
export type RowEditEventDetail<T extends GridItem = GridItem> =
  CellEditEventDetail<T> & {
    rowKey?: string;
  };

const cell = directive(CellDirective);

const cellStyle = tw`min-w-0 focus-visible:-outline-offset-2`;
const editableCellStyle = tw`min-w-0 p-0 focus-visible:bg-slate-50`;

/**
 * @fires btrix-remove CustomEvent
 * @fires btrix-input CustomEvent
 */
@customElement("btrix-data-grid-row")
@localized()
export class DataGridRow<
  const T extends GridItem = GridItem,
> extends FormControl(TableRow) {
  /**
   * Set of columns.
   */
  @property({ type: Array })
  columns?: GridColumn<T>[] = [];

  /**
   * Row key/ID.
   */
  @property({ type: String })
  key?: GridRowId;

  /**
   * Data to be presented as a row.
   */
  @property({ type: Object, hasChanged: (a, b) => !isEqual(a, b) })
  item?: T;

  /**
   * Whether the row can be removed.
   */
  @property({ type: Boolean })
  removable = false;

  /**
   * Whether the row can be clicked.
   */
  @property({ type: Boolean })
  clickable = false;

  /**
   * Whether the row can be expanded.
   */
  @property({ type: Boolean })
  expandable = false;

  /**
   * Whether cells can be edited.
   */
  @property({ type: Boolean })
  editCells = false;

  /**
   * Vertical alignment of content.
   */
  @property({ type: String })
  alignContent: "start" | "center" | "end" = "center";

  /**
   * Form control name, if used in a form.
   */
  @property({ type: String, reflect: true })
  name?: string;

  @state()
  private expanded = false;

  @state()
  private cellValues: Partial<T> = {};

  readonly #focus = new DataGridFocusController(this);

  readonly #invalidInputsMap = new Map<
    GridColumn<T>["field"],
    InputElement["validationMessage"]
  >();

  public formResetCallback() {
    this.setValue(this.item || {});
    this.commitValue();
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
  private readonly gridCells?: NodeListOf<DataGridCell<T>>;

  private setValue(cellValues: Partial<T>) {
    Object.keys(cellValues).forEach((field) => {
      (this.cellValues[field] as T[keyof T] | undefined) = cellValues[field];
    });

    this.setFormValue(JSON.stringify(this.cellValues));
  }

  private commitValue() {
    this.cellValues = {
      ...this.cellValues,
    };
  }

  render() {
    if (!this.columns?.length) return html``;

    let expandCell = html``;
    let removeCell = html``;

    if (this.expandable) {
      expandCell = html`
        <btrix-data-grid-cell
          class=${clsx(tw`border-l p-0`, cellStyle)}
          @keydown=${this.onKeydown}
        >
          <sl-icon-button
            class=${clsx(
              tw`p-1 text-base transition-transform`,
              this.expanded && tw`rotate-90`,
            )}
            name="chevron-right"
            label=${this.expanded ? msg("Contract") : msg("Expand")}
            @click=${(e: MouseEvent) => {
              e.stopPropagation();
              this.expanded = !this.expanded;
            }}
          ></sl-icon-button>
        </btrix-data-grid-cell>
      `;
    }

    if (this.removable) {
      removeCell = html`
        <btrix-data-grid-cell
          class=${clsx(tw`border-l p-0`, cellStyle)}
          @keydown=${this.onKeydown}
        >
          <sl-tooltip content=${msg("Remove")} hoist>
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

    return html`${expandCell}${this.columns.map(this.renderCell)}${removeCell}
    ${when(this.expanded && this.item, (item) => this.renderDetails({ item }))} `;
  }

  renderDetails = (_row: { item: GridItem }) => html``;

  private readonly renderCell = (col: GridColumn<T>, i: number) => {
    const item = this.item;

    if (!item) return;

    const editable =
      this.editCells && typeof col.editable === "function"
        ? col.editable(item)
        : col.editable;
    const tooltipContent = editable
      ? this.#invalidInputsMap.get(col.field)
      : col.renderCellTooltip
        ? col.renderCellTooltip({ item })
        : undefined;

    return html`
      <sl-tooltip
        class="[--max-width:40ch]"
        ?disabled=${!tooltipContent}
        hoist
        placement="bottom"
        trigger=${
          // Disable showing tooltip on focus by default
          // so that it doesn't show along with the browser
          // validation message on form submit.
          // The tooltip is shown manually when tabbed to
          // by checking `:focus-visible` on focus.
          "hover"
        }
      >
        <btrix-data-grid-cell
          class=${clsx(
            !this.clickable && i > 0 && tw`border-l`,
            cellStyle,
            editable && editableCellStyle,
            this.alignContent === "start" && tw`items-start`,
            this.alignContent === "end" && tw`items-end`,
            col.align === "center" && tw`justify-center`,
            col.align === "end" && tw`justify-end`,
          )}
          .column=${col}
          .item=${item}
          value=${ifDefined(this.cellValues[col.field] ?? undefined)}
          ?editable=${editable}
          ${cell(col as GridColumn)}
          @keydown=${this.onKeydown}
        ></btrix-data-grid-cell>

        <div slot="content">${tooltipContent}</div>
      </sl-tooltip>
    `;
  };

  /**
   * Keyboard navigation based on recommendations from
   * https://www.w3.org/WAI/ARIA/apg/patterns/grid/#keyboardinteraction-settingfocusandnavigatinginsidecells
   */
  private onKeydown(e: KeyboardEvent) {
    const tableCell = e.currentTarget as DataGridCell;
    const composedTarget = e.composedPath()[0] as HTMLElement;

    if (composedTarget === tableCell) {
      if (!this.gridCells) {
        console.debug("no grid cells");
        return;
      }

      const gridCells = Array.from(this.gridCells);
      const i = gridCells.indexOf(e.target as DataGridCell<T>);

      if (i === -1) return;

      const findNextTabbable = (idx: number, direction: -1 | 1) => {
        const el = gridCells[idx + direction];

        if (!(el as unknown)) return;

        if (this.#focus.isTabbable(el)) {
          e.preventDefault();

          el.focus();
        } else {
          findNextTabbable(idx + direction, direction);
        }
      };

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown": {
          findNextTabbable(i, 1);
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          findNextTabbable(i, -1);
          break;
        }
        case "Tab": {
          // Check if tabbing was prevented, likely by the focus controller
          if (e.defaultPrevented) {
            findNextTabbable(i, 1);
          }
          break;
        }
        default:
          break;
      }
    } else {
      if (e.key === "Escape") {
        const tabIndex = composedTarget.tabIndex;

        // Temporarily disable focusable child so that focus
        // doesn't move when exiting
        composedTarget.setAttribute("tabindex", "-1");
        // Exit back into grid navigation
        tableCell.focus();
        // Reinstate focusable child
        composedTarget.setAttribute("tabindex", `${tabIndex}`);
      }
    }
  }

  private readonly onCellInput = async (
    e: CustomEvent<CellEditEventDetail>,
  ) => {
    e.stopPropagation();

    this.dispatchEvent(
      new CustomEvent<RowEditEventDetail>("btrix-input", {
        detail: {
          ...e.detail,
          rowKey: this.key,
        },
        bubbles: true,
        composed: true,
      }),
    );

    const { field, value, validity, validationMessage } = e.detail;
    const tableCell = e.target as DataGridCell;

    if (validity.valid) {
      this.#invalidInputsMap.delete(field);
    } else {
      this.#invalidInputsMap.set(field, validationMessage);
      this.setValidity(validity, validationMessage, tableCell);
    }

    this.setValue({
      [field]: value.toString(),
    } as Partial<T>);
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
      this.setValidity(validity, validationMessage, tableCell);
    }

    this.commitValue();

    await this.updateComplete;
    await tableCell.input?.updateComplete;

    if (validity.valid) {
      const firstInvalid = Array.from(this.gridCells || []).find((cell) =>
        cell.validity?.valid ? false : cell,
      );

      if (firstInvalid?.validity && firstInvalid.validationMessage) {
        this.setValidity(
          firstInvalid.validity,
          firstInvalid.validationMessage,
          firstInvalid,
        );
      } else {
        this.setValidity({});
      }
    }
  };
}
