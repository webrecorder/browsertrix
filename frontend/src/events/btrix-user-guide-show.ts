export type BtrixUserGuideShowEvent = CustomEvent<{ path?: string }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-user-guide-show": BtrixUserGuideShowEvent;
  }
}
