export type BtrixUserGuideShowEvent = CustomEvent<{
  path?: string;
  search?: boolean | string;
}>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-user-guide-show": BtrixUserGuideShowEvent;
  }
}
