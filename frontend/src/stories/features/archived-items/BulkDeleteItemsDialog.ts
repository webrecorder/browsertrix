import { html } from "lit";

import type { BulkDeleteItemsDialog } from "@/features/archived-items/bulk-delete-items-dialog";

import "@/features/archived-items/bulk-delete-items-dialog";

export type RenderProps = BulkDeleteItemsDialog;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-bulk-delete-items-dialog
    .items=${props.items}
    ?open=${props.open}
  ></btrix-bulk-delete-items-dialog>`;
};
