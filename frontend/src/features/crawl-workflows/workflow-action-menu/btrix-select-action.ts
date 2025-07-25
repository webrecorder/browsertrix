import type { Action } from "./types";

export type BtrixSelectActionEvent = CustomEvent<{ action: Action }>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-select-action": BtrixSelectActionEvent;
  }
}
