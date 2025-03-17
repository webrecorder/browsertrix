import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { SyntaxInputChangeEventDetail } from "@/components/ui/syntax-input";
import type { SeedConfig } from "@/types/crawler";

const SELECTOR_DELIMITER = "->" as const;
const HEADER_CELLS = [
  msg("CSS Selector"),
  msg("Link Attribute"),
  html`<span class="sr-only">${msg("Row actions")}</span>`,
] as const;
const COLUMN_WIDTHS = ["20em", "1fr", "min-content"] as const;
const emptyRow = ["", ""];

@customElement("btrix-link-selector-table")
@localized()
export class LinkSelectorTable extends BtrixElement {
  @property({ type: Array })
  selectors: SeedConfig["selectLinks"] = [];

  @property({ type: Boolean })
  editable = true;

  @state()
  private rows: string[][] = [];

  public get value(): SeedConfig["selectLinks"] {
    return this.rows.map((row) => {
      return row.join("->");
    });
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("selectors")) {
      this.rows = this.selectors.map((str) => str.split(SELECTOR_DELIMITER));
    }
  }

  render() {
    return html`
      <btrix-data-table
        class="leading-none text-neutral-600 [--btrix-cell-padding:0]"
        .columns=${HEADER_CELLS}
        .columnWidths=${COLUMN_WIDTHS}
        .rows=${this.rows.map(this.row)}
      >
      </btrix-data-table>
      ${when(
        this.editable,
        () => html`
          <sl-button
            class="mt-1 w-full"
            @click=${() => this.updateRows(emptyRow, this.rows.length)}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly row = (row: string[], rowIdx: number) => {
    const editableCell = (value: string, cellIdx: number) => {
      return html`<div class="size-full">
        <btrix-syntax-input
          class="size-full"
          value=${value}
          language="css"
          placeholder=${cellIdx === 0 ? "button.custom-link" : "data-href"}
          @btrix-change=${(e: CustomEvent<SyntaxInputChangeEventDetail>) => {
            e.stopPropagation();

            this.updateRows(
              row.map((v, i) => (i === cellIdx ? e.detail.value : v)),
              rowIdx,
            );
          }}
        >
        </btrix-syntax-input>
      </div>`;
    };

    if (this.editable) {
      return [
        ...row.map(editableCell),
        html`
          <sl-icon-button
            label=${msg("Remove exclusion")}
            class="text-base hover:text-danger"
            name="trash3"
            @click=${() => this.updateRows(undefined, rowIdx)}
          ></sl-icon-button>
        `,
      ];
    }

    return row.map(
      (cell) => html` <btrix-code value=${cell} language="css"></btrix-code> `,
    );
  };

  private updateRows(
    row: LinkSelectorTable["rows"][0] | undefined,
    idx: number,
  ) {
    const pre = this.rows.slice(0, idx);
    const ap = this.rows.slice(idx + 1);

    const rows = row ? [...pre, row, ...ap] : [...pre, ...ap];

    if (rows.length) {
      this.rows = rows;
    } else {
      this.rows = [emptyRow];
    }
  }
}
