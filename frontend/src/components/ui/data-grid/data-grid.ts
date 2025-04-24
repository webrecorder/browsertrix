import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { nanoid } from "nanoid";

import type { CellEventDetail } from "./data-grid-row";
import type { GridColumn, GridItem, GridRowId, GridRows } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

/**
 * @slot label
 * @attr name
 * @fires btrix-change
 */
@customElement("btrix-data-grid")
@localized()
export class DataGrid extends TailwindElement {
  // TODO Abstract to mixin or decorator
  static formAssociated = true;
  readonly #internals?: ElementInternals;

  /**
   * Set of columns.
   */
  @property({ type: Array })
  columns: GridColumn[] = [];

  /**
   * Set of data to be presented as rows.
   */
  @property({ type: Array })
  items: GridItem[] = [];

  /**
   * Key to use as row ID. Defaults to one generated with nanoid.
   * See [repeat directive](https://lit.dev/docs/api/directives/#repeat) for details.
   */
  @property({ type: String })
  repeatKey?: string;

  @property({ type: Boolean })
  stickyHeader = false;

  /**
   * Text for form label. Use slot to include markup.
   */
  @property({ type: String })
  label?: string;

  /**
   * Whether rows can be added and removed
   */
  @property({ type: Boolean })
  editRows = false;

  /**
   * Whether cells can be edited
   */
  @property({ type: Boolean })
  editCells = false;

  /**
   * Make grid focusable on validation.
   */
  @property({ type: Number, reflect: true })
  tabindex = 0;

  @state()
  private rows: GridRows = new Map();

  /**
   * Function to convert items to form value string.
   */
  public stringifyItems = (items: GridItem[]) => JSON.stringify(items);

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

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("items") || changedProperties.has("editRows")) {
      this.setRowsFromItems(this.items);
      this.setValueFromItems(this.items);
    } else if (changedProperties.has("rows")) {
      this.setValueFromRows(this.rows);
    }
  }

  private setRowsFromItems(items: GridItem[]) {
    if (this.editRows && !items.length) {
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

  private setValueFromItems(items: GridItem[]) {
    if (!this.#internals?.form) return;

    this.#internals.setFormValue(this.stringifyItems(items));
  }

  private setValueFromRows(rows: GridRows) {
    if (!this.#internals?.form) return;

    this.setValueFromItems(Array.from(rows.values()));
  }

  render() {
    return html`
      <slot name="label">
        <label class="form-label text-xs">${this.label}</label>
      </slot>

      <btrix-table
        class=${clsx(
          tw`relative size-full`,
          this.stickyHeader && tw`rounded border`,
        )}
        style=${this.editRows
          ? `--btrix-table-grid-template-columns: repeat(${this.columns.length}, auto) max-content`
          : ""}
      >
        <btrix-table-head
          class=${clsx(
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            this.stickyHeader
              ? tw`sticky top-0 z-10 rounded-t-[0.1875rem] border-b bg-neutral-50 [&>*:not(:first-child)]:border-l`
              : tw`px-px`,
          )}
        >
          ${this.columns.map(
            (col) => html`
              <btrix-table-header-cell>${col.label}</btrix-table-header-cell>
            `,
          )}
          ${this.editRows
            ? html`<btrix-table-header-cell>
                <span class="sr-only">${msg("Remove")}</span>
              </btrix-table-header-cell>`
            : nothing}
        </btrix-table-head>
        <btrix-table-body
          class=${clsx(
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
            tw`leading-none [&>*:not(:first-child)]:border-t`,
            // TODO Support different input sizes
            tw`*:min-h-[calc(var(--sl-input-height-medium)+1px)]`,
            // TODO Fix input ring not visible with overflow-auto
            // tw`overflow-auto`,
            !this.stickyHeader && tw`rounded border`,
          )}
        >
          ${repeat(
            this.rows,
            ([id]) => id,
            ([id, item]) => html`
              <btrix-data-grid-row
                name=${id}
                key=${id}
                .item=${item}
                .columns=${this.columns}
                ?removable=${this.editRows}
                ?editCells=${this.editCells}
                @btrix-input=${this.onInputForRow(id)}
                @btrix-change=${() => void this.dispatchChange()}
                @btrix-remove=${() => this.removeRow(id)}
              ></btrix-data-grid-row>
            `,
          )}
        </btrix-table-body>
      </btrix-table>

      ${this.editRows ? this.renderAddButton() : nothing}
    `;
  }

  private readonly renderAddButton = () => {
    return html`<footer class="mt-2">
      <sl-button size="small" @click=${this.addRow}>
        <sl-icon slot="prefix" name="plus-lg"></sl-icon>
        <span class="text-neutral-600">${msg("Add More")}</span>
      </sl-button>
    </footer>`;
  };

  private addRow() {
    const id = nanoid();

    this.rows = new Map(this.rows.set(id, {}));
  }

  private removeRow(id: GridRowId) {
    this.rows.delete(id);

    if (this.rows.size === 0 && this.editRows) {
      this.addRow();
    } else {
      this.rows = new Map(this.rows);
    }

    this.setValueFromRows(this.rows);
  }

  private readonly onInputForRow =
    (id: GridRowId) => (e: CustomEvent<CellEventDetail>) => {
      const { field, value, valid } = e.detail;

      const rows = new Map(this.rows);
      rows.set(id, {
        ...rows.get(id),
        [field]: value,
      });

      // TODO Check all rows
      if (valid) {
        this.#internals?.setValidity({});
      } else {
        this.#internals?.setValidity(
          {
            customError: true,
          },
          msg("Please fix all highlighted issues."),
        );
      }

      this.setValueFromRows(rows);
    };

  private readonly dispatchChange = async () => {
    await this.updateComplete;

    this.dispatchEvent(new CustomEvent("btrix-change"));
  };
}
