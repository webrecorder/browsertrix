import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

function image(data: ReplayData) {
  if (!data?.blobUrl) {
    return html`<div
      class=${tw`flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-neutral-500`}
    >
      <sl-icon name="slash-circle"></sl-icon>
      ${msg("Screenshot not available")}
    </div>`;
  }
  return html` <img class=${tw`h-full w-full`} src=${data.blobUrl} /> `;
}

export function renderScreenshots(crawlData: ReplayData, qaData: ReplayData) {
  return guard(
    [crawlData, qaData],
    () => html`
      <div class=${tw`flex flex-col gap-2 md:flex-row`}>
        <div class=${tw`flex-1`}>
          <h3
            id="qaScreenshotHeading"
            class=${tw`mb-2 flex text-base font-medium`}
          >
            ${msg("Crawl Screenshot")}
          </h3>
          <div
            class=${tw`aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50 shadow-sm`}
            aria-labelledby="qaScreenshotHeading"
          >
            ${when(qaData, image, renderSpinner)}
          </div>
        </div>
        <div class=${tw`flex-1`}>
          <h3
            id="crawlScreenshotHeading"
            class=${tw`mb-2 flex text-base font-medium`}
          >
            ${msg("Replay Screenshot")}
          </h3>
          <div
            class=${tw`aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50 shadow-sm`}
            aria-labelledby="crawlScreenshotHeading"
          >
            ${when(crawlData, image, renderSpinner)}
          </div>
        </div>
      </div>

      ${when(
        crawlData && qaData,
        () => {},
        // html`
        //   <sl-image-comparer>
        //     <img
        //       slot="before"
        //       src="${crawlData?.blobUrl || ""}"
        //       aria-labelledby="crawlScreenshotHeading"
        //     />
        //     <img
        //       slot="after"
        //       src="${qaData?.blobUrl || ""}"
        //       aria-labelledby="replayScreenshotHeading"
        //     />
        //   </sl-image-comparer>
        // `
      )}
    `,
  );
}
