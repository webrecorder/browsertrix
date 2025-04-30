import type { ReactiveController, ReactiveControllerHost } from "lit";
import { nanoid } from "nanoid";
import type { EmptyObject } from "type-fest";

import type { DataGrid } from "../data-grid";
import type { GridItem, GridRowId, GridRows } from "../types";

/**
 * Enables removing and adding rows from a grid.
 *
 * Implementing this controller isn't necessary if the `.items` property
 * is specified in `<btrix-data-grid>`. For grids with editable rows
 * that are slotted into `<btrix-data-grid>`, it may be necessary to
 * implement this controller on the container component.
 */
export class DataGridRowsController implements ReactiveController {
  readonly #host: ReactiveControllerHost &
    EventTarget & {
      items?: GridItem[];
      rowKey?: DataGrid["rowKey"];
      defaultItem?: DataGrid["defaultItem"];
      removeRows?: DataGrid["removeRows"];
      addRows?: DataGrid["addRows"];
    };

  readonly #rowIds = new Map<GridItem, GridRowId>();

  #prevItems?: GridItem[];

  public rows: GridRows = new Map<GridRowId, GridItem>();

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

  private setRowsFromItems(items: GridItem[]) {
    const rowKey = this.#host.rowKey;

    this.rows = new Map(
      this.#host.rowKey
        ? items.map((item) => [
            item[rowKey as unknown as string] as GridRowId,
            item,
          ])
        : items.map((item) => [this.getCachedId(item), item]),
    );
  }

  /**
   * Use item reference to get a persistent generated ID.
   */
  private getCachedId(item: GridItem): GridRowId {
    const id = this.#rowIds.get(item);

    if (id) return id;

    const newId = nanoid();

    this.#rowIds.set(item, newId);

    return newId;
  }

  public setItems(items: GridItem[]) {
    if (!this.#prevItems || items !== this.#prevItems) {
      this.setRowsFromItems(items);

      this.#prevItems = items;
    }
  }

  public addRow(item: GridItem | EmptyObject) {
    const id = nanoid();

    this.rows.set(id, item);
    this.#host.requestUpdate();
  }

  public removeRow(id: GridRowId) {
    this.rows.delete(id);

    if (this.rows.size === 0 && this.#host.defaultItem) {
      this.addRow(this.#host.defaultItem);
    }

    this.#host.requestUpdate();
  }
}
