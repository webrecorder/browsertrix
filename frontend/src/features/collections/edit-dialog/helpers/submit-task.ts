import { msg, str } from "@lit/localize";
import { type TaskFunction } from "@lit/task";

import {
  type CollectionEdit,
  type CollectionSavedEvent,
} from "../../collection-edit-dialog";

import {
  type CollectionThumbnailPage,
  type CollectionUpdate,
} from "@/types/collection";
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
        thumbnail?: {
          selectedSnapshot: CollectionThumbnailPage;
        };
      };
      const { thumbnail: { selectedSnapshot } = {}, ...rest } = updateObject;
      const tasks = [];

      // TODO get filename from rwp?
      const fileName = `page-thumbnail_${selectedSnapshot?.urlPageId}.jpeg`;
      let file: File | undefined;

      if (selectedSnapshot) {
        const blob =
          await this.thumbnailSelector?.thumbnailPreview?.thumbnailBlob;
        if (blob) {
          file = new File([blob], fileName, {
            type: blob.type,
          });
        }
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

      console.log({ rest });
      if (Object.keys(rest).length)
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
