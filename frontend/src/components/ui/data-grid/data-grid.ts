import { localized, msg } from "@lit/localize";
import type { SlInput, SlInputEvent } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { nanoid } from "nanoid";

import type { Column, Item, RowId, Rows } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

enum Variant {
  Border = "border",
}

export const inputStyle = [
  tw`[--sl-input-background-color-hover:transparent] [--sl-input-background-color:transparent] [--sl-input-border-color-hover:transparent] [--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)]`,
  tw`data-[valid]:[--sl-input-border-color:transparent]`,
  tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
  tw`part-[input]:px-[var(--sl-spacing-x-small)]`,
];

/**
 * @attr name
 * @fires btrix-change
 */
@customElement("btrix-data-grid")
@localized()
export class DataGrid extends TailwindElement {
  // TODO Abstract to mixin or decorator
  static formAssociated = true;
  readonly internals?: ElementInternals;

  @property({ type: Array })
  columns: Column[] = [];

  @property({ type: Array })
  items: Item[] = [];

  @property({ type: String })
  repeatKey?: string;

  @property({ type: String })
  variant = Variant.Border;

  @property({ type: String })
  label?: string;

  @property({ type: Boolean })
  editable = false;

  @state()
  private rows: Rows = new Map();

  public itemsToValue = (items: Item[]) => JSON.stringify(items);
  public valueToItems = (value: string) => JSON.parse(value);

  public checkValidity(): boolean | null {
    return this.internals?.checkValidity() ?? null;
  }

  public reportValidity(): void {
    this.internals?.reportValidity();
  }

  public get validity(): ValidityState | null {
    return this.internals?.validity ?? null;
  }

  public get validationMessage(): string | null {
    return this.internals?.validationMessage ?? null;
  }

  public get form(): HTMLFormElement | null {
    return this.internals?.form ?? null;
  }

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items")) {
      this.setRowsFromItems(this.items);

      if (this.editable) {
        this.setValueFromItems(this.items);
      }
    } else if (changedProperties.has("editable")) {
      if (this.editable) {
        this.setValueFromItems(this.items);
      }
    } else if (changedProperties.has("rows")) {
      if (this.editable) {
        this.setValueFromRows(this.rows);
      }
    }
  }

  private setRowsFromItems(items: Item[]) {
    if (this.editable && !items.length) {
      this.addRow();
    } else {
      const repeatKey = this.repeatKey;

      if (repeatKey) {
        this.rows = new Map(
          items.map((item) => [item[repeatKey] as string, item]),
        );
      } else {
        this.rows = new Map(items.map((item) => [nanoid(), item]));
      }
    }
  }

  private setValueFromItems(items: Item[]) {
    this.internals?.setFormValue(this.itemsToValue(items));
  }

  private setValueFromRows(rows: Rows) {
    this.setValueFromItems(Array.from(rows.values()));
  }

  render() {
    return html`
      <slot name="label">
        <label class="form-label text-xs">${this.label}</label>
      </slot>

      <btrix-table
        class=${clsx(
          tw`relative`,
          {
            [Variant.Border]: tw`rounded border`,
          }[this.variant],
        )}
        style=${this.editable
          ? `--btrix-table-grid-template-columns: repeat(${this.columns.length}, auto) max-content`
          : ""}
      >
        <btrix-table-head
          class=${clsx(
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            tw`sticky top-0 z-10 [&>*:not(:first-child)]:border-l`,
            {
              [Variant.Border]: tw`rounded-t-[0.1875rem] border-b bg-neutral-50`,
            }[this.variant],
          )}
        >
          ${this.columns.map(
            (col) => html`
              <btrix-table-header-cell>${col.label}</btrix-table-header-cell>
            `,
          )}
          ${this.editable
            ? html`<btrix-table-header-cell>
                <span class="sr-only">${msg("Remove")}</span>
              </btrix-table-header-cell>`
            : nothing}
        </btrix-table-head>
        <btrix-table-body
          class=${clsx(
            // TODO Fix input ring not visible with overflow-auto
            tw`overflow-auto leading-none`,
            tw`*:min-h-[var(--sl-input-height-medium)]`,
            !this.editable &&
              tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            {
              [Variant.Border]: tw`[&>*:not(:first-child)]:border-t [&>*>*:not(:first-child)]:border-l`,
            }[this.variant],
          )}
        >
          ${repeat(
            this.rows,
            ([id]) => id,
            (row) => this.renderRow(...row),
          )}
        </btrix-table-body>
      </btrix-table>

      ${this.editable ? this.renderAddButton() : nothing}
    `;
  }

  private readonly renderAddButton = () => {
    return html`<footer class="mt-3">
      <sl-button @click=${this.addRow}>${msg("Add Row")}</sl-button>
    </footer>`;
  };

  private renderRow(id: string, item: Item) {
    return html` <btrix-table-row>
      ${this.columns.map(
        (col) => html`
          <btrix-table-cell
            @sl-change=${() => void this.dispatchChange()}
            @sl-input=${this.onInput(id, col.field)}
          >
            ${this.editable
              ? col.renderInput
                ? col.renderInput(item)
                : this.renderInput(item, col)
              : col.renderItem
                ? col.renderItem(item)
                : item[col.field]}
          </btrix-table-cell>
        `,
      )}
      ${this.editable
        ? html`<btrix-table-cell>
            <sl-tooltip content=${msg("Remove Row")}>
              <sl-icon-button
                class="text-base hover:text-danger"
                name="trash3"
                @click=${() => this.removeRow(id)}
              ></sl-icon-button>
            </sl-tooltip>
          </btrix-table-cell>`
        : nothing}
    </btrix-table-row>`;
  }

  private renderInput(item: Item, col: Column) {
    return html`
      <sl-input
        class=${clsx(inputStyle)}
        type=${col.inputType ?? "text"}
        value=${item[col.field] ?? ""}
      ></sl-input>
    `;
  }

  private addRow() {
    const id = nanoid();

    this.rows = new Map(this.rows.set(id, {}));
  }

  private removeRow(id: RowId) {
    this.rows.delete(id);

    if (this.rows.size === 0 && this.editable) {
      this.addRow();
    } else {
      this.rows = new Map(this.rows);
    }

    if (this.editable) {
      this.setValueFromRows(this.rows);
      void this.dispatchChange();
    }
  }

  private readonly onInput =
    (id: string, field: Column["field"]) => (e: SlInputEvent) => {
      const input = e.target as SlInput;

      const rows = new Map(this.rows);
      rows.set(id, {
        ...rows.get(id),
        [field]: input.value,
      });

      this.setValueFromRows(rows);
    };

  private readonly dispatchChange = async () => {
    await this.updateComplete;

    this.dispatchEvent(new CustomEvent("btrix-change"));
  };
}
