import type { CollectionLikeItem } from "./types";

import { collectionSchema, type Collection } from "@/types/collection";

export const isActualCollection = (
  item: CollectionLikeItem,
): item is Collection => collectionSchema.safeParse(item).success;
