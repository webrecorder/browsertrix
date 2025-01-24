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

  if (!this.descriptionEditor?.checkValidity()) {
    this.errorTab = "about";
    void this.descriptionEditor?.focus();
    throw new Error("invalid_data");
  }

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

  const description = this.descriptionEditor.value;

  const { access, allowPublicDownload, defaultThumbnailName } =
    this.shareSettings ?? {};

  const formData = serialize(form) as CollectionUpdate;

  const { homeView, useThumbnail, selectedSnapshot } = this.homepageSettings!;

  const data = {
    ...formData,
    description,
    access,
    allowPublicDownload,
    defaultThumbnailName,
  };

  return {
    collectionUpdate: collectionUpdateSchema.parse(data),
    homepage: {
      homeView,
      useThumbnail,
      selectedSnapshot,
    },
  };
}
