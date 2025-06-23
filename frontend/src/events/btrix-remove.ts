export type BtrixRemoveEvent<T = unknown> = CustomEvent<{ item: T }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-remove": BtrixRemoveEvent;
  }
}
