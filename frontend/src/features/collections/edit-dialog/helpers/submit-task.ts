import { msg, str } from "@lit/localize";
import { type TaskFunction } from "@lit/task";

import {
  type CollectionEdit,
  type CollectionSavedEvent,
} from "../../collection-edit-dialog";
import { HomeView } from "../../collection-snapshot-preview";
import { type SnapshotItem } from "../../select-collection-start-page";

import { type CollectionUpdate } from "@/types/collection";
import { isApiError } from "@/utils/api";

export default function submitTask(
  this: CollectionEdit,
): TaskFunction<readonly unknown[]> {
  return async (_, { signal }) => {
    if (!this.collection) throw new Error("Collection is undefined");
    try {
      const updates = await this.checkChanged();
      if (!updates) throw new Error("invalid_data");
      const updateObject = Object.fromEntries(updates) as CollectionUpdate & {
        homepage?: {
          homeView: `${HomeView}`;
          useThumbnail: "on" | "off";
          selectedSnapshot: SnapshotItem | null;
        };
      };
      const { homepage, ...rest } = updateObject;
      const pageId =
        (homepage?.homeView === HomeView.URL &&
          homepage.selectedSnapshot?.pageId) ||
        null;
      const tasks = [];

      if (this.collection.homeUrlPageId !== pageId) {
        tasks.push(
          this.api.fetch(
            `/orgs/${this.orgId}/collections/${this.collection.id}/home-url`,
            {
              method: "POST",
              body: JSON.stringify({
                pageId,
              }),
              signal,
            },
          ),
        );
      }

      const shouldUpload =
        homepage?.homeView === HomeView.URL &&
        homepage.useThumbnail === "on" &&
        homepage.selectedSnapshot &&
        this.homePageId !== homepage.selectedSnapshot.pageId;

      // TODO get filename from rwp?
      const fileName = `page-thumbnail_${homepage?.selectedSnapshot?.pageId}.jpeg`;
      let file: File | undefined;

      if (shouldUpload && this.homepageSettings?.thumbnailPreview) {
        const blob = await this.homepageSettings.thumbnailPreview.thumbnailBlob;

        if (blob) {
          file = new File([blob], fileName, {
            type: blob.type,
          });
        }
      }

      if (shouldUpload) {
        if (!file) throw new Error("invalid_data");
        tasks.push(
          this.api.upload(
            `/orgs/${this.orgId}/collections/${this.collection.id}/thumbnail?filename=${fileName}`,
            file,
            signal,
          ),
        );
        rest.defaultThumbnailName = null;
      }
      tasks.push(
        await this.api.fetch<{ updated: boolean }>(
          `/orgs/${this.orgId}/collections/${this.collection.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(rest),
            signal,
          },
        ),
      );

      console.log(tasks);

      await Promise.all(tasks);

      this.dispatchEvent(
        new CustomEvent("btrix-collection-saved", {
          detail: {
            id: this.collection.id,
          },
        }) as CollectionSavedEvent,
      );
      this.notify.toast({
        message: msg(
          str`Updated collection “${this.name || this.collection.name}”`,
        ),
        variant: "success",
        icon: "check2-circle",
        id: "collection-metadata-status",
      });
      // void this.hideDialog();
    } catch (e) {
      let message = isApiError(e) && e.message;
      if (message === "collection_name_taken") {
        message = msg("This name is already taken.");
      }
      if (message === "invalid_data") {
        message = msg("Please review issues with your changes.");
      }
      console.error(e);
      this.notify.toast({
        message: message || msg("Something unexpected went wrong"),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "collection-metadata-status",
      });
      throw e;
    }
  };
}
