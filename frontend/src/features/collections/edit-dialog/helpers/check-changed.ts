import { type CollectionEdit } from "../../collection-edit-dialog";
import { HomeView } from "../../collection-snapshot-preview";

import gatherState from "./gather-state";

import type { CollectionUpdate } from "@/types/collection";

export default async function checkChanged(this: CollectionEdit) {
  try {
    const { collectionUpdate, homepage } = await gatherState.bind(this)();
    const updates = (
      Object.entries(collectionUpdate) as [
        keyof CollectionUpdate,
        CollectionUpdate[keyof CollectionUpdate],
      ][]
    ).filter(([name, value]) => this.collection?.[name] !== value) as [
      keyof CollectionUpdate | "homepage",
      CollectionUpdate[keyof CollectionUpdate] | typeof homepage,
    ][];

    const pageId =
      (homepage.homeView === HomeView.URL &&
        homepage.selectedSnapshot?.pageId) ||
      null;

    const shouldUpload =
      homepage.homeView === HomeView.URL &&
      homepage.useThumbnail &&
      homepage.selectedSnapshot &&
      this.collection?.homeUrlPageId !== homepage.selectedSnapshot.pageId;

    if (pageId != this.collection?.homeUrlPageId || shouldUpload) {
      updates.push(["homepage", homepage]);
    }
    console.log({ updates });
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
