export type BtrixConfirmEvent = CustomEvent<never>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-confirm": BtrixConfirmEvent;
  }
}
