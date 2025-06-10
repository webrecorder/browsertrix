import type { BtrixChangeEvent } from "@/events/btrix-change";
import type { BtrixRemoveEvent } from "@/events/btrix-remove";

export type BtrixFileRemoveEvent = BtrixRemoveEvent<File>;
export type BtrixFileChangeEvent = BtrixChangeEvent<File[]>;
