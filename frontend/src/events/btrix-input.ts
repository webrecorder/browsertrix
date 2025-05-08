export type BtrixInputEvent<T = unknown> = CustomEvent<{ value: T }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-input": BtrixInputEvent;
  }
}
