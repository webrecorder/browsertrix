import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { BulkCollectionItemsDialog } from "@/features/archived-items/bulk-collection-items-dialog";

import "@/features/archived-items/bulk-collection-items-dialog";

export type RenderProps = BulkCollectionItemsDialog;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-bulk-collection-items-dialog
    .items=${props.items}
    collectionId=${ifDefined(props.collectionId)}
    newCollectionName=${ifDefined(props.newCollectionName)}
    ?open=${props.open}
  ></btrix-bulk-collection-items-dialog>`;
};
