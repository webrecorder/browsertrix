import type { FileLike } from "./types";

import type { BtrixChangeEvent } from "@/events/btrix-change";
import type { BtrixRemoveEvent } from "@/events/btrix-remove";

export type BtrixFileRemoveEvent = BtrixRemoveEvent<File | FileLike>;
export type BtrixFileChangeEvent = BtrixChangeEvent<File[]>;
