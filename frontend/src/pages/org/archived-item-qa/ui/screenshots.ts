import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { renderSpinner } from "./spinner";

export function renderScreenshots(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    ${guard(
      [crawlData, qaData],
      () => html`
        <div class="mb-2 flex justify-between text-base font-medium">
          <h3 id="crawlScreenshotHeading">${msg("Crawl Screenshot")}</h3>
          <h3 id="replayScreenshotHeading">${msg("Replay Screenshot")}</h3>
        </div>
        <div class="aspect-video overflow-hidden rounded border bg-slate-50">
          ${when(
            crawlData.blobUrl && qaData.blobUrl,
            () => html`
              <sl-image-comparer>
                <img
                  slot="before"
                  src="${crawlData.blobUrl || ""}"
                  aria-labelledby="crawlScreenshotHeading"
                />
                <img
                  slot="after"
                  src="${qaData.blobUrl || ""}"
                  aria-labelledby="replayScreenshotHeading"
                />
              </sl-image-comparer>
            `,
            renderSpinner,
          )}
        </div>
      `,
    )}
  `;
}
