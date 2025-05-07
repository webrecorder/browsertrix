import type { GridItem, GridRowId } from "../types";

export type BtrixRowClickEvent<T = GridItem> = CustomEvent<{
  id: GridRowId;
  item: T;
}>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-row-click": BtrixRowClickEvent;
  }
}
