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

  public rows: GridRows = new Map();

  constructor(host: ReactiveControllerHost & EventTarget) {
    this.#host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}
  hostUpdate() {
    if (this.#host.items) {
      if (!this.#prevItems || this.#host.items !== this.#prevItems) {
        this.setRowsFromItems(this.#host.items);

        this.#prevItems = this.#host.items;
      }
    }
  }

  private setRowsFromItems(items: GridItem[]) {
    this.rows = new Map(items.map(cached((item) => [nanoid(), item])));
    // this.#host.requestUpdate();
  }

  public addRow(item: GridItem | EmptyObject) {
    const id = nanoid();

    this.rows = new Map(this.rows.set(id, item));
    this.#host.requestUpdate();
  }

  public removeRow(id: GridRowId) {
    this.rows.delete(id);
    this.rows = new Map(this.rows);

    if (this.rows.size === 0 && this.#host.defaultItem) {
      this.addRow(this.#host.defaultItem);
    } else {
      this.rows = new Map(this.rows);
    }

    this.#host.requestUpdate();
  }
}
