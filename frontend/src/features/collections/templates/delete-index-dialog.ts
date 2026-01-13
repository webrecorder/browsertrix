import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import type { Dialog } from "@/components/ui/dialog";
import type { Collection } from "@/types/collection";

export function deleteIndexDialog({
  open,
  collection,
  hide,
  confirm,
}: {
  open: boolean;
  collection?: Collection;
  hide: () => void;
  confirm: () => Promise<unknown>;
}) {
  return html`<btrix-dialog
    label=${msg("Delete Deduplication Index?")}
    ?open=${open}
    @sl-hide=${hide}
  >
    ${when(collection, (col) => {
      const collection_name = html`<strong class="font-semibold"
        >${col.name}</strong
      >`;

      return html`
        <p>
          ${msg(
            html`Are you sure you want to delete the deduplication index for
            ${collection_name}?`,
          )}
        </p>
        <p class="mt-3">
          ${msg(
            "The index will only be deleted if there are not any workflows using this index as a deduplication source.",
          )}
        </p>
        <p class="mt-3">${msg("This action cannot be undone.")}</p>
      `;
    })}
    <div slot="footer" class="flex justify-between">
      <sl-button
        size="small"
        @click=${(e: MouseEvent) =>
          void (e.target as HTMLElement)
            .closest<Dialog>("btrix-dialog")
            ?.hide()}
        .autofocus=${true}
        >${msg("Cancel")}</sl-button
      >
      <sl-button
        size="small"
        variant="danger"
        @click=${async () => {
          await confirm();
          hide();
        }}
        >${msg("Delete Index")}</sl-button
      >
    </div>
  </btrix-dialog>`;
}
