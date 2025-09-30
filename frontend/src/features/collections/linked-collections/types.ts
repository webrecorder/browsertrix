import type { BtrixRemoveEvent } from "@/events/btrix-remove";
import type { Collection } from "@/types/collection";

// NOTE Some API endpoints return only the ID for a collection
export type CollectionLikeItem = Collection | { id: string; name?: string };

export type BtrixRemoveLinkedCollectionEvent =
  BtrixRemoveEvent<CollectionLikeItem>;
