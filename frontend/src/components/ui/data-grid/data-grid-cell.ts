import type { SlInput, SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import get from "lodash/fp/get";
import { type Primitive } from "type-fest";

import { TableCell } from "../table/table-cell";

import type {
  GridColumn,
  GridColumnNumberType,
  GridColumnSelectType,
  GridItem,
} from "./types";
import { GridColumnType } from "./types";

import { DataGridFocusController } from "@/components/ui/data-grid/controllers/focus";
import type { UrlInput } from "@/components/ui/url-input";
import { tw } from "@/utils/tailwind";

const cellInputStyle = [
  tw`size-full [--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)] focus:z-10`,
  // TODO We need to upgrade to Tailwind v4 for inset rings to actually work
  // tw`focus-within:part-[base]:inset-ring-2`,
  tw`data-[invalid]:[--sl-input-border-color:transparent] data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
  tw`part-[base]:h-full part-[form-control-input]:h-full part-[form-control]:h-full part-[input]:h-full`,
  tw`part-[input]:px-[var(--sl-spacing-x-small)]`,
];

export type InputElement = SlInput | SlSelect | UrlInput;

export type CellEditEventDetail<T extends GridItem = GridItem> = {
  field: keyof T;
  value: InputElement["value"];
  validity: InputElement["validity"];
  validationMessage: InputElement["validationMessage"];
};

/**
 * @fires btrix-input CustomEvent
 * @fires btrix-change CustomEvent
 */
@customElement("btrix-data-grid-cell")
export class DataGridCell<
  const T extends GridItem = GridItem,
> extends TableCell {
  @property({ type: Object })
  column?: GridColumn<T>;

  @property({ type: Object })
  item?: T;

  @property({ type: String })
  value?: T[keyof T];

  @property({ type: Boolean })
  editable = false;

  @property({ type: String, reflect: true, noAccessor: true })
  role = "gridcell";

  @property({ attribute: false })
  customRenderCell?: () => TemplateResult;

  @property({ attribute: false })
  customRenderEditCell?: () => TemplateResult;

  @property({ type: Number, reflect: true })
  tabindex = 0;

  readonly #focus = new DataGridFocusController<T>(this, {
    setFocusOnTabbable: true,
  });

  public checkValidity() {
    return this.input?.checkValidity();
  }

  public get validity() {
    return this.input?.validity;
  }

  public get validationMessage() {
    return this.input?.validationMessage;
  }

  public get input() {
    if (!this.column) return null;

    return this.shadowRoot!.querySelector<InputElement>(
      `[name=${String(this.column.field)}]`,
    );
  }

  protected createRenderRoot() {
    const root = super.createRenderRoot();
    const inputEvents = ["btrix-input", "sl-input"];
    const changeEvents = ["btrix-change", "sl-change"];

    // Attach to render root so that `e.target` is input
    inputEvents.forEach((name) => {
      root.addEventListener(name, this.onInput);
    });

    changeEvents.forEach((name) => {
      root.addEventListener(name, this.onChange);
    });

    return root;
  }

  render() {
    if (!this.column || !this.item) return html`<slot></slot>`;

    if (this.editable) {
      return this.renderEditCell({ item: this.item, value: this.value });
    }

    return html`${this.renderCell({ item: this.item })}`;
  }

  renderCell = ({ item }: { item: T }): string | TemplateResult<1> => {
    return html`${(this.column && get(this.column.field, item)) ?? ""}`;
  };

  renderEditCell = ({
    item,
    value: cellValue,
  }: {
    item: T;
    value?: T[keyof T];
  }): TemplateResult<1> => {
    const col = this.column;

    if (!col) return html``;

    const value = cellValue ?? item[col.field] ?? "";

    switch (col.inputType) {
      case GridColumnType.Select: {
        return html`
          <div class="box-border w-full p-1">
            <sl-select
              name=${String(col.field)}
              value=${value}
              placeholder=${ifDefined(col.inputPlaceholder)}
              class="w-full min-w-[5em]"
              size="small"
              ?required=${col.required}
              hoist
            >
              ${(col as GridColumnSelectType).selectOptions.map(
                (opt) => html`
                  <sl-option value=${opt.value}>
                    ${opt.label ?? opt.value}
                  </sl-option>
                `,
              )}
            </sl-select>
          </div>
        `;
      }
      case GridColumnType.URL:
        return html`<btrix-url-input
          name=${String(col.field)}
          class=${clsx(cellInputStyle)}
          value=${value}
          placeholder=${ifDefined(col.inputPlaceholder)}
          ?required=${col.required}
          hideHelpText
        >
        </btrix-url-input>`;
      case GridColumnType.Number: {
        const { min, max, step } = col as GridColumnNumberType<T>;
        return html`<sl-input
          name=${String(col.field)}
          class=${clsx(cellInputStyle)}
          type="number"
          value=${value}
          placeholder=${ifDefined(col.inputPlaceholder)}
          ?required=${col.required}
          min=${ifDefined(this.evalWithItemIfFn(min))}
          max=${ifDefined(this.evalWithItemIfFn(max))}
          step=${ifDefined(this.evalWithItemIfFn(step))}
        ></sl-input>`;
      }
      default:
        break;
    }

    return html`
      <sl-input
        name=${String(col.field)}
        class=${clsx(cellInputStyle)}
        type="text"
        value=${value}
        placeholder=${ifDefined(col.inputPlaceholder)}
        ?required=${col.required}
      ></sl-input>
    `;
  };

  private evalWithItemIfFn<U extends Primitive>(
    maybeFn: U | ((item: T | undefined) => U),
  ) {
    if (typeof maybeFn === "function") {
      return maybeFn(this.item);
    }
    return maybeFn;
  }

  private readonly onInput = (e: Event) => {
    if (!this.column) return;

    e.stopPropagation();

    const input = e.target as InputElement;

    this.dispatchEvent(
      new CustomEvent<CellEditEventDetail<T>>("btrix-input", {
        detail: {
          field: this.column.field,
          value: input.value,
          validity: input.validity,
          validationMessage: input.validationMessage,
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private readonly onChange = (e: Event) => {
    if (!this.column) return;

    e.stopPropagation();

    const input = e.target as InputElement;

    this.dispatchEvent(
      new CustomEvent<CellEditEventDetail<T>>("btrix-change", {
        detail: {
          field: this.column.field,
          value: input.value,
          validity: input.validity,
          validationMessage: input.validationMessage,
        },
        bubbles: true,
        composed: true,
      }),
    );
  };
}
