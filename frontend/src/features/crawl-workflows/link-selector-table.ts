import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  SyntaxInput,
  SyntaxInputChangeEventDetail,
} from "@/components/ui/syntax-input";
import type { TableRow } from "@/components/ui/table/table-row";
import type { SeedConfig } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

const SELECTOR_DELIMITER = "->" as const;
const emptyRow = ["", ""];

const selName = "selector" as const;
const attrName = "attribute" as const;

@customElement("btrix-link-selector-table")
@localized()
export class LinkSelectorTable extends BtrixElement {
  @property({ type: Array })
  selectors: SeedConfig["selectLinks"] = [];

  @property({ type: Boolean })
  editable = true;

  @state()
  private values: string[][] = [];

  @queryAll("btrix-table-row")
  private readonly rows!: NodeListOf<TableRow>;

  public get value(): SeedConfig["selectLinks"] {
    return this.values.map((row) => {
      return row.join("->");
    });
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("selectors")) {
      this.values = this.selectors.map((str) => str.split(SELECTOR_DELIMITER));
    }
  }

  render() {
    return html`
      <btrix-table
        class="relative h-full w-full grid-cols-[20em_1fr_min-content] rounded border"
      >
        <btrix-table-head
          class=${clsx(
            tw`rounded-t-[0.1875rem] border-b bg-slate-50`,
            // TODO Refactor padding config https://github.com/webrecorder/browsertrix/issues/2497
            tw`[--btrix-cell-padding-bottom:var(--sl-spacing-x-small)] [--btrix-cell-padding-left:var(--sl-spacing-x-small)] [--btrix-cell-padding-right:var(--sl-spacing-x-small)] [--btrix-cell-padding-top:var(--sl-spacing-x-small)]`,
          )}
        >
          <btrix-table-header-cell>
            ${msg("CSS Selector")}
          </btrix-table-header-cell>
          <btrix-table-header-cell class="border-l">
            ${msg("Link Attribute")}
          </btrix-table-header-cell>
          ${when(
            this.editable,
            () => html`
              <btrix-table-header-cell class="border-l">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
            `,
          )}
        </btrix-table-head>
        <btrix-table-body class="overflow-auto">
          ${this.values.map(this.row)}
        </btrix-table-body>
      </btrix-table>

      ${when(
        this.editable,
        () => html`
          <sl-button
            class="mt-1 w-full"
            @click=${() => this.updateRows(emptyRow, this.values.length)}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly row = (cells: string[], i: number) => {
    const onSelChange = (value: string) => {
      const input = this.rows[i].querySelector<SyntaxInput>(
        `btrix-syntax-input.${selName}`,
      )!;

      input.error = "";

      try {
        // Validate selector
        document.createDocumentFragment().querySelector(value);

        this.updateRows([value, cells[1]], i);
      } catch {
        input.error = msg("Please enter a valid CSS selector");
      }
    };
    const onAttrChange = (value: string) => {
      const input = this.rows[i].querySelector<SyntaxInput>(
        `btrix-syntax-input.${attrName}`,
      )!;

      input.error = "";

      try {
        new HTMLElement().getAttribute(value);

        this.updateRows([cells[0], value], i);
      } catch {
        input.error = msg("Please enter a valid HTML attribute");
      }
    };
    return html`
      <btrix-table-row class=${i > 0 ? "border-t" : ""}>
        <btrix-table-cell>
          ${this.cell({
            name: selName,
            value: cells[0],
            placeholder: "button.custom-link",
            onChange: onSelChange,
          })}
        </btrix-table-cell>
        <btrix-table-cell class="border-l">
          ${this.cell({
            name: attrName,
            value: cells[1],
            placeholder: "button.custom-link",
            onChange: onAttrChange,
          })}
        </btrix-table-cell>
        ${when(
          this.editable,
          () => html`
            <btrix-table-cell class="border-l">
              <sl-icon-button
                label=${msg("Remove exclusion")}
                class="text-base hover:text-danger"
                name="trash3"
                @click=${() => this.updateRows(undefined, i)}
              ></sl-icon-button>
            </btrix-table-cell>
          `,
        )}
      </btrix-table-row>
    `;
  };

  private readonly cell = ({
    name,
    value,
    placeholder,
    onChange,
  }: {
    name: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
  }) => {
    if (!this.editable) {
      return html`<btrix-code value=${value} language="css"></btrix-code>`;
    }

    return html`
      <btrix-syntax-input
        class=${clsx(name, tw`size-full`)}
        value=${value}
        language="css"
        placeholder=${placeholder}
        @btrix-change=${(e: CustomEvent<SyntaxInputChangeEventDetail>) => {
          e.stopPropagation();
          onChange(e.detail.value);
        }}
      >
      </btrix-syntax-input>
    `;
  };

  private updateRows(
    row: LinkSelectorTable["values"][0] | undefined,
    idx: number,
  ) {
    const pre = this.values.slice(0, idx);
    const ap = this.values.slice(idx + 1);

    const rows = row ? [...pre, row, ...ap] : [...pre, ...ap];

    if (rows.length) {
      this.values = rows;
    } else {
      this.values = [emptyRow];
    }
  }
}
