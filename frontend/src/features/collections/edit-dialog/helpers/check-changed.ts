import { isEqual } from "lodash";

import { type CollectionEdit } from "../../collection-edit-dialog";

import gatherState from "./gather-state";

import type { Collection, CollectionUpdate } from "@/types/collection";

const checkEqual = <K extends keyof CollectionUpdate>(
  collection: Collection,
  key: K,
  b: CollectionUpdate[K] | null,
) => {
  let a = collection[key] as (typeof collection)[K] | null;
  // caption is sometimes null when empty, collection update has empty string instead
  if (key === "caption") {
    a = a || null;
    b = b || null;
  }
  // deeply compare (for objects)
  const eq = isEqual(a, b);
  return eq;
};

type KVPairs<T> = {
  [K in keyof T]-?: readonly [K, T[K]];
}[keyof T][];

export default async function checkChanged(this: CollectionEdit) {
  try {
    const { collectionUpdate } = await gatherState.bind(this)();

    const state: CollectionUpdate = {
      ...collectionUpdate,
    };

    const pairs = Object.entries(state) as KVPairs<typeof state>;

    // filter out unchanged properties
    const updates = pairs.filter(
      ([name, value]) => !checkEqual(this.collection!, name, value),
    ) as KVPairs<CollectionUpdate>;

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
