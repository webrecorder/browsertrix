import type { SlInput, SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TableCell } from "../table/table-cell";

import type { GridColumn, GridColumnSelectType, GridItem } from "./types";
import { GridColumnType } from "./types";

import type { UrlInput } from "@/components/ui/url-input";
import { tw } from "@/utils/tailwind";

const inputStyle = tw`part-[base]:h-full part-[form-control-input]:h-full part-[form-control]:h-full part-[input]:h-full`;
const cellInputStyle = [
  tw`size-full [--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)] focus:z-10`,
  tw`data-[invalid]:[--sl-input-border-color:transparent] data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
  tw`part-[input]:px-[var(--sl-spacing-x-small)]`,
];

export type InputElement = SlInput | SlSelect | UrlInput;

export type CellEditEventDetail = {
  field: GridColumn["field"];
  value: InputElement["value"];
  validity: InputElement["validity"];
  validationMessage: InputElement["validationMessage"];
};

/**
 * @fires btrix-input CustomEvent<CellEditEventDetail>
 * @fires btrix-change CustomEvent<CellEditEventDetail>
 */
@customElement("btrix-data-grid-cell")
export class DataGridCell extends TableCell {
  @property({ type: Object })
  column?: GridColumn;

  @property({ type: Object })
  item?: GridItem;

  @property({ attribute: false })
  customRenderCell?: () => TemplateResult;

  @property({ attribute: false })
  customRenderEditCell?: () => TemplateResult;

  @property({ type: Number, reflect: true })
  tabindex = 0;

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
      `[name=${this.column.field}]`,
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
    if (!this.column || !this.item) return html``;

    if (this.column.editable) {
      return this.renderEditCell({ item: this.item });
    }

    return this.renderCell({ item: this.item });
  }

  renderCell = ({ item }: { item: GridItem }) => {
    return html`${(this.column && item[this.column.field]) ?? ""}`;
  };

  renderEditCell = ({ item }: { item: GridItem }) => {
    const col = this.column;

    if (!col) return html``;

    const value = item[col.field] ?? "";

    switch (col.inputType) {
      case GridColumnType.Select: {
        return html`
          <div class="box-border w-full p-1">
            <sl-select
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
        name=${col.field}
        class=${clsx(cellInputStyle, inputStyle)}
        type=${col.inputType === GridColumnType.Number ? "number" : "text"}
        value=${value}
        placeholder=${ifDefined(col.inputPlaceholder)}
        ?required=${col.required}
      ></sl-input>
    `;
  };

  private readonly onInput = (e: Event) => {
    if (!this.column) return;

    e.stopPropagation();

    const input = e.target as InputElement;

    this.dispatchEvent(
      new CustomEvent<CellEditEventDetail>("btrix-input", {
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
      new CustomEvent<CellEditEventDetail>("btrix-change", {
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
