export type BtrixAddEvent<T = unknown> = CustomEvent<{ item: T }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-add": BtrixAddEvent;
  }
}
