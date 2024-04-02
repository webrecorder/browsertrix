import { msg } from "@lit/localize";
import { html } from "lit";

import type { ReplayData } from "../types";

export function renderResources(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class="mb-2 flex justify-between text-base font-medium">
      <h3 id="crawlResourcesHeading">${msg("Crawl Resources")}</h3>
      <h3 id="replayResourcesHeading">${msg("Replay Resources")}</h3>
    </div>
    <div class="flex rounded border bg-slate-50">
      <div
        class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-green-400"
        style="max-width: 50%"
        aria-labelledby="crawlResourcesHeading"
      >
        ${crawlData.resources}
      </div>
      <div
        class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-yellow-400"
        style="max-width: 50%"
        aria-labelledby="replayResourcesHeading"
      >
        ${qaData.resources}
      </div>
    </div>
  `;
}
