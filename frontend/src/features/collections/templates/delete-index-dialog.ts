import { msg } from "@lit/localize";
import type { SlButton, SlCheckbox } from "@shoelace-style/shoelace";
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
  confirm: (arg: { removeFromWorkflows: boolean }) => Promise<unknown>;
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
            html`Are you sure you want to delete the index and disable
            deduplication for ${collection_name}?`,
          )}
        </p>
        <p class="mt-3 text-pretty">
          ${msg(
            "This action cannot be reversed and may result in the loss of archived content.",
          )}
        </p>
        <btrix-details class="mt-3">
          <span slot="title">${msg("More Options")}</span>
          <sl-checkbox
            class="mt-2"
            checked
            help-text=${msg(
              "If unchecked, deduplication will be re-enabled after the next crawl run.",
            )}
          >
            ${msg("Remove as deduplication source from workflows")}
          </sl-checkbox>
        </btrix-details>
      `;
    })}
    <div slot="footer" class="flex justify-between">
      <sl-button
        size="small"
        @click=${(e: MouseEvent) =>
          void (e.currentTarget as SlButton)
            .closest<Dialog>("btrix-dialog")
            ?.hide()}
        .autofocus=${true}
        >${msg("Cancel")}</sl-button
      >
      <sl-button
        size="small"
        variant="danger"
        @click=${async (e: MouseEvent) => {
          const btn = e.currentTarget as SlButton;
          const checkbox = btn
            .closest("btrix-dialog")
            ?.querySelector<SlCheckbox>("sl-checkbox");
          btn.setAttribute("loading", "true");
          await confirm({
            removeFromWorkflows: checkbox?.checked === false ? false : true,
          });
          btn.removeAttribute("loading");
          hide();
        }}
        >${msg("Delete Index")}</sl-button
      >
    </div>
  </btrix-dialog>`;
}
