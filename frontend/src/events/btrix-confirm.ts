export type BtrixConfirmEvent<T = never> = CustomEvent<T>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-confirm": BtrixConfirmEvent;
  }
}
