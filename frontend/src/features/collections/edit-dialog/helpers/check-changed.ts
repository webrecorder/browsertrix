import { isEqual } from "lodash";

import { type CollectionEdit } from "../../collection-edit-dialog";

import gatherState from "./gather-state";

import type { Collection, CollectionUpdate } from "@/types/collection";

const checkEqual = <K extends keyof CollectionUpdate>(
  collection: Collection,
  key: K,
  b: CollectionUpdate[K] | null,
) => {
  const a = collection[key];
  // caption is null when empty, collection update has empty string instead
  if (key === "caption") {
    b = b || null;
  }
  // deeply compare (for objects)
  const eq = isEqual(a, b);
  return eq;
};

export default async function checkChanged(this: CollectionEdit) {
  try {
    const { collectionUpdate, thumbnail } = await gatherState.bind(this)();
    const updates = (
      Object.entries(collectionUpdate) as [
        keyof CollectionUpdate,
        CollectionUpdate[keyof CollectionUpdate],
      ][]
    ).filter(([name, value]) => !checkEqual(this.collection!, name, value)) as [
      keyof CollectionUpdate | "thumbnail",
      CollectionUpdate[keyof CollectionUpdate] | typeof thumbnail,
    ][];

    const shouldUpload =
      thumbnail.selectedSnapshot &&
      !isEqual(this.collection?.thumbnailSource, thumbnail.selectedSnapshot) &&
      this.blobIsLoaded;

    if (shouldUpload) {
      updates.push(["thumbnail", thumbnail]);
    }
    if (updates.length > 0) {
      this.dirty = true;
    } else {
      this.dirty = false;
    }
    return updates;
  } catch (e) {
    console.error(e);
    this.dirty = true;
  }
}
