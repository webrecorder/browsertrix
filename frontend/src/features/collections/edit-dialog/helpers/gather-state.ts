import { getFormControls, serialize } from "@shoelace-style/shoelace";

import {
  type CollectionEdit,
  type EditDialogTab,
} from "../../collection-edit-dialog";

import type { TabGroupPanel } from "@/components/ui/tab-group/tab-panel";
import {
  collectionUpdateSchema,
  type CollectionUpdate,
} from "@/types/collection";

export default async function gatherState(this: CollectionEdit) {
  const form = await this.form;

  const elements = getFormControls(form);
  const invalidElement = elements.find(
    (el) => !(el as HTMLInputElement).checkValidity(),
  );
  if (invalidElement) {
    this.errorTab = invalidElement.closest<TabGroupPanel>(
      "btrix-tab-group-panel",
    )!.name as EditDialogTab;
    (invalidElement as HTMLElement).focus();
    throw new Error("invalid_data");
  } else {
    this.errorTab = null;
  }

  const { access, allowPublicDownload } = (await this.shareSettings) ?? {};

  const formData = serialize(form) as CollectionUpdate & {
    setInitialView: boolean;
  };

  const selectedSnapshot = this.selectedSnapshot;

  if (this.defaultThumbnailName == null && !selectedSnapshot) {
    formData.thumbnailSource = null;
  }

  const { setInitialView } = formData;
  const data: CollectionUpdate = {
    ...formData,
    access,
    defaultThumbnailName: this.defaultThumbnailName,
    allowPublicDownload,
  };

  return {
    collectionUpdate: collectionUpdateSchema.parse(data),
    thumbnail: {
      selectedSnapshot,
    },
    setInitialView,
  };
}
