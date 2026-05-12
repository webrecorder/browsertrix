export type BtrixChangeEventDetail<T = unknown> = { value: T };

export type BtrixChangeEvent<T = unknown> = CustomEvent<
  BtrixChangeEventDetail<T>
>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-change": BtrixChangeEvent;
  }
}
