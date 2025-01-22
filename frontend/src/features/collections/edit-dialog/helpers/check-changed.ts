import { type CollectionEdit } from "../../collection-edit-dialog";
import { HomeView } from "../../collection-snapshot-preview";
import type { SnapshotItem } from "../../select-collection-start-page";

import type { CollectionUpdate } from "@/types/collection";

export default async function checkChanged(this: CollectionEdit) {
  try {
    const { collectionUpdate, homepage } = await this.gatherFormData();
    const updates = (
      Object.entries(collectionUpdate) as [
        keyof CollectionUpdate,
        CollectionUpdate[keyof CollectionUpdate],
      ][]
    ).filter(([name, value]) => this.collection?.[name] !== value) as [
      keyof CollectionUpdate | "homepage",
      (
        | CollectionUpdate[keyof CollectionUpdate]
        | (typeof homepage & { selectedSnapshot: SnapshotItem | null })
      ),
    ][];

    if (
      (homepage.homeView === HomeView.Pages && this.homePageId) ||
      (homepage.homeView === HomeView.URL &&
        this.homepageSettings?.selectedSnapshot &&
        this.homePageId !== this.homepageSettings.selectedSnapshot.pageId)
    ) {
      updates.push([
        "homepage",
        {
          ...homepage,
          selectedSnapshot: this.homepageSettings?.selectedSnapshot ?? null,
        },
      ]);
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
