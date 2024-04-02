import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

export function renderReplay(crawlData: ReplayData) {
  return html`
    <div
      class="relative aspect-video overflow-hidden rounded-b-lg border-x border-b"
    >
      ${guard(
        [crawlData],
        () => html`
          ${when(crawlData.replayUrl, () => {
            return html`<iframe
              src=${crawlData.replayUrl}
              class="h-full w-full outline"
            ></iframe>`;
          })}
        `,
      )}
    </div>
  `;
}
