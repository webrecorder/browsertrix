import { msg } from "@lit/localize";
import { html } from "lit";
import { when } from "lit/directives/when.js";

import type { Dialog } from "@/components/ui/dialog";
import type { Collection } from "@/types/collection";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

export function createIndexDialog({
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
    label=${msg("Create Deduplication Index")}
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
            html`Are you sure you want to manually create a deduplication index
            for ${collection_name}?`,
          )}
          ${when(col.crawlCount, (count) => {
            const items_count = localize.number(count);
            const plural_of_items = pluralOf("items", count);

            return msg(
              html`${items_count} archived ${plural_of_items} will be imported
              into the index.`,
            );
          })}
        </p>
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
        variant="primary"
        @click=${async () => {
          await confirm();
          hide();
        }}
        >${msg("Create Index")}</sl-button
      >
    </div>
  </btrix-dialog>`;
}
