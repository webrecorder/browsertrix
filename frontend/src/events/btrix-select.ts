export type BtrixSelectEvent<T = unknown> = CustomEvent<{ item: T }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-select": BtrixSelectEvent<never>;
  }
}
