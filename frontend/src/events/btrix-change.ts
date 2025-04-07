export type BtrixChangeEvent<T = unknown> = CustomEvent<{ value: T }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-change": BtrixChangeEvent<unknown>;
  }
}
