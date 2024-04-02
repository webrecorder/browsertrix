import { msg } from "@lit/localize";
import { html } from "lit";

import type { ReplayData } from "../types";

export function renderText(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class="mb-2 flex justify-between text-base font-medium">
      <h3 id="crawlTextHeading">${msg("Crawl Text")}</h3>
      <h3 id="replayTextHeading">${msg("Replay Text")}</h3>
    </div>
    <div class="flex rounded border bg-slate-50">
      <div
        class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-green-400"
        style="max-width: 50%"
        aria-labelledby="crawlTextHeading"
      >
        ${crawlData.text}
      </div>
      <div
        class="aspect-video h-full flex-1 overflow-auto whitespace-pre-line p-4 outline -outline-offset-2 outline-yellow-400"
        style="max-width: 50%"
        aria-labelledby="replayTextHeading"
      >
        ${qaData.text}
      </div>
    </div>
  `;
}
