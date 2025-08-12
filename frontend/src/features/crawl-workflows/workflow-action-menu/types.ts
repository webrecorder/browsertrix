import type { BtrixSelectEvent } from "@/events/btrix-select";

export enum Action {
  Run = "run",
  TogglePauseResume = "togglePauseResume",
  Stop = "stop",
  Cancel = "cancel",
  EditBrowserWindows = "editBrowserWindows",
  EditExclusions = "editExclusions",
  Duplicate = "duplicate",
  Delete = "delete",
}

export type BtrixSelectActionEvent = BtrixSelectEvent<{ action: Action }>;
