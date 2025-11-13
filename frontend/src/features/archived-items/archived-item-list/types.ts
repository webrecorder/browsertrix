import type { BtrixChangeEvent } from "@/events/btrix-change";

export type ArchivedItemCheckedEvent = BtrixChangeEvent<{
  checked: boolean;
}>;
