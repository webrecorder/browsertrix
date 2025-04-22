// import type { SlInputEvent } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat, type KeyFn } from "lit/directives/repeat.js";
import { nanoid } from "nanoid";

import type { Column, Item, Rows } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-data-grid")
export class DataGrid extends TailwindElement {
  // TODO Move to mixin or decorator
  static formAssociated = true;
  readonly internals?: ElementInternals;

  @property({ type: Array })
  columns: Column[] = [];

  @property({ type: Array })
  items: Item[] = [];

  @property({ type: Boolean })
  editable = false;

  @property({ type: String })
  repeatKey?: string;

  @state()
  private rows: Rows = new Map();

  public rowsToValue = (rows: Item[]) => JSON.stringify(rows);
  public valueToRows = (value: string) => JSON.parse(value);

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items")) {
      this.setRowsFromItems();
    }

    if (changedProperties.has("editable") && this.editable) {
      this.setValueFromItems();
    }
  }

  private setRowsFromItems() {
    const repeatKey = this.repeatKey;

    if (repeatKey) {
      this.rows = new Map(
        this.items.map((item) => [item[repeatKey] as string, item]),
      );
    } else {
      this.rows = new Map(this.items.map((item) => [nanoid(), item]));
    }
  }

  private setValueFromItems() {
    this.internals?.setFormValue(this.rowsToValue(this.items));
  }

  render() {
    console.log("form:", this.internals?.form);

    return html`
      <btrix-table>
        <btrix-table-head>
          ${this.columns.map(
            (col) => html`
              <btrix-table-header-cell>${col.label}</btrix-table-header-cell>
            `,
          )}
        </btrix-table-head>
        <btrix-table-body>
          ${repeat(
            this.rows,
            ([id]) => id,
            (row) => this.renderRow(...row),
          )}</btrix-table-body
        >
      </btrix-table>
    `;
  }

  private renderRow(_id: string, item: Item) {
    return html` <btrix-table-row>
      ${this.columns.map(
        ({ field }) => html`
          <btrix-table-cell>${item[field]}</btrix-table-cell>
        `,
      )}
    </btrix-table-row>`;
  }

  // private onInput(e: SlInputEvent) {
  //   const input = e.target as HTMLInputElement;
  //   this.internals?.setFormValue(input.value);
  // }
}
