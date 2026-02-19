import { msg } from "@lit/localize";
import { html } from "lit";

import { AppStateService } from "@/utils/state";

export function missingDependenciesPanel({
  ids,
  open,
  hide,
}: {
  ids: string[];
  open: boolean;
  hide?: () => void;
}) {
  if (!ids.length) return;

  return html`<sl-drawer
    class="[--body-spacing:0] [--footer-spacing:var(--sl-spacing-x-small)_var(--sl-spacing-medium)] [--header-spacing:var(--sl-spacing-medium)]  part-[header]:[border-bottom:1px_solid_var(--sl-panel-border-color)]"
    @sl-show=${() => {
      // Hide any other open panels
      AppStateService.updateUserGuideOpen(false);
    }}
    @sl-hide=${hide}
    ?open=${open}
  >
    <span slot="label" class="flex gap-3">
      <sl-icon
        class="flex-shrink-0 text-base"
        name="file-earmark-minus"
      ></sl-icon>
      <span class="leading-4">${msg("Missing Dependencies")}</span>
    </span>

    <p class="m-4 text-pretty text-neutral-600">
      ${msg(
        "The following is a list of IDs for archived items required by this crawl that are no longer available.",
      )}
    </p>

    <ul class="divide-y">
      ${ids.map(
        (id) =>
          html`<li class="flex items-center justify-between px-4 py-1">
            <div class="font-monostyle text-neutral-700">${id}</div>
            <btrix-copy-button
              value=${id}
              content=${msg("Copy ID")}
              hoist
            ></btrix-copy-button>
          </li>`,
      )}
    </ul>
  </sl-drawer>`;
}
