import { isEqual } from "lodash";

import { type CollectionEdit } from "../../collection-edit-dialog";

import gatherState from "./gather-state";

import type { CollectionUpdate } from "@/types/collection";

export default async function checkChanged(this: CollectionEdit) {
  try {
    const { collectionUpdate, thumbnail } = await gatherState.bind(this)();
    const updates = (
      Object.entries(collectionUpdate) as [
        keyof CollectionUpdate,
        CollectionUpdate[keyof CollectionUpdate],
      ][]
    ).filter(([name, value]) => this.collection?.[name] !== value) as [
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
