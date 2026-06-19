import { msg, str } from "@lit/localize";
import { type TaskFunction } from "@lit/task";

import { type CollectionEdit } from "../../collection-edit-dialog";

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
      const updateObject = Object.fromEntries(updates) as CollectionUpdate;

      if (Object.keys(updateObject).length) {
        await this.api.fetch<{ updated: boolean }>(
          `/orgs/${this.orgId}/collections/${this.collection.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(updateObject),
            signal,
          },
        );
      }

      this.dispatchEvent(
        new CustomEvent<{
          id: string;
        }>("btrix-collection-saved", {
          detail: {
            id: this.collection.id,
          },
          bubbles: true,
          composed: true,
        }),
      );
      this.dispatchEvent(new CustomEvent("btrix-change"));

      const collection_name = this.collection.name;

      this.notify.toast({
        message: msg(str`Updated collection “${collection_name}”`),
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
