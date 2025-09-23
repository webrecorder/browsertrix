import type { CollectionLikeItem } from "./types";

import { collectionSchema, type Collection } from "@/types/collection";

export const isActualCollection = (
  item: CollectionLikeItem,
): item is Collection => {
  try {
    collectionSchema.parse(item);
    return true;
  } catch (err) {
    if (item.name) {
      console.debug(err);
    }
  }
  return false;
};
