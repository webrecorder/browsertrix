import type { GridItem, GridRowId } from "../types";

export type BtrixSelectRowEvent<T = GridItem> = CustomEvent<{
  id: GridRowId;
  item: T;
}>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-select-row": BtrixSelectRowEvent;
  }
}
