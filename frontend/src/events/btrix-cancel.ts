export type BtrixCancelEvent = CustomEvent<never>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-cancel": BtrixCancelEvent;
  }
}
