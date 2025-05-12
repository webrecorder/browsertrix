import type {
  ReactiveController,
  ReactiveControllerHost,
  TemplateResult,
} from "lit";
import { nanoid } from "nanoid";
import type { EmptyObject } from "type-fest";

import type { DataGrid } from "../data-grid";
import { renderRows } from "../renderRows";
import type { GridItem, GridRowId, GridRows } from "../types";

import { cached } from "@/utils/weakCache";

export const emptyItem: EmptyObject = {};

/**
 * Enables removing and adding rows from a grid.
 *
 * Implementing this controller isn't necessary if the `.items` property
 * is specified in `<btrix-data-grid>`. For grids with editable rows
 * that are slotted into `<btrix-data-grid>`, it may be necessary to
 * implement this controller on the container component.
 */
export class DataGridRowsController<Item = GridItem>
  implements ReactiveController
{
  readonly #host: ReactiveControllerHost &
    EventTarget & {
      items?: Item[];
    } & Partial<
      Pick<DataGrid, "rowKey" | "defaultItem" | "rowsRemovable" | "rowsAddible">
    >;

  #prevItems?: Item[];

  public rows: GridRows<Item | EmptyObject> = new Map<
    GridRowId,
    Item | EmptyObject
  >();

  constructor(host: ReactiveControllerHost & EventTarget) {
    this.#host = host;
    host.addController(this);
  }

  hostConnected() {
    if (this.#host.items) {
      this.setItems(this.#host.items);
    }
  }
  hostDisconnected() {}
  hostUpdate() {
    if (this.#host.items) {
      this.setItems(this.#host.items);
    }
  }

  private setRowsFromItems(items: Item[]) {
    const rowKey = this.#host.rowKey;

    this.rows = new Map(
      this.#host.rowKey
        ? items.map((item) => [item[rowKey as keyof Item] as GridRowId, item])
        : items.map(
            cached((item) => [nanoid(), item], { cacheConstructor: Map }),
          ),
    );
  }

  public setItems(items: Item[]) {
    if (!this.#prevItems || items !== this.#prevItems) {
      this.setRowsFromItems(items);

      this.#prevItems = items;
    }
  }

  public updateItem(id: GridRowId, item: Item) {
    this.rows.set(id, item);
    this.#host.requestUpdate();
  }

  public addRows(defaultItem: Item | EmptyObject = emptyItem, count = 1) {
    for (let i = 0; i < count; i++) {
      const id = nanoid();

      this.rows.set(id, defaultItem);
    }

    this.#host.requestUpdate();
  }

  public removeRow(id: GridRowId) {
    this.rows.delete(id);

    if (this.rows.size === 0 && this.#host.defaultItem) {
      this.addRows(this.#host.defaultItem);
    }

    this.#host.requestUpdate();
  }

  public isEmpty(item: Item | EmptyObject): item is EmptyObject {
    return item === emptyItem;
  }

  public renderRows(
    renderRow: (
      { id, item }: { id: GridRowId; item: Item | EmptyObject },
      index: number,
    ) => TemplateResult,
  ) {
    return renderRows<Item>(this.rows, renderRow);
  }
}
