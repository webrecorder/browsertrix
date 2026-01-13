import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import type { Dialog } from "@/components/ui/dialog";
import type { Collection } from "@/types/collection";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

export function purgeIndexDialog({
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
    label=${msg("Purge Deduplication Index?")}
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
            html`Are you sure you want to purge the deduplication index for
            ${collection_name}?`,
          )}
        </p>
        ${when(col.indexStats?.removedCrawls, (count) => {
          const items_count = localize.number(count);
          const plural_of_items = pluralOf("items", count);

          return html`<p class="mt-3">
            ${msg(
              html`This will purge the index of ${items_count} deleted
              ${plural_of_items} items and rebuild the index using items
              currently in the deduplication source.`,
            )}
          </p>`;
        })}
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
        variant="warning"
        @click=${async () => {
          await confirm();
          hide();
        }}
        >${msg("Purge Index")}</sl-button
      >
    </div>
  </btrix-dialog>`;
}
