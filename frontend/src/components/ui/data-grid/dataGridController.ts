import type { ReactiveController, ReactiveControllerHost } from "lit";
import { nanoid } from "nanoid";
import type { EmptyObject } from "type-fest";

import type { DataGrid } from "./data-grid";
import type { GridItem, GridRowId, GridRows } from "./types";

import { cached } from "@/utils/weakCache";

/**
 *
 */
export class DataGridController implements ReactiveController {
  readonly #host: ReactiveControllerHost &
    EventTarget & {
      items?: GridItem[];
      defaultItem?: DataGrid["defaultItem"];
      editRows?: DataGrid["editRows"];
    };

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
    this.rows = new Map(items.map(cached((item) => [nanoid(), item])));
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
