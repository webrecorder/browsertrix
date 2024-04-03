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

export function renderScreenshots(
  crawlData: ReplayData,
  qaData: ReplayData,
  splitView: boolean,
) {
  const content = html`
    <div class=${tw`flex${splitView ? "" : tw` justify-between`}`}>
      <h3
        id="crawlScreenshotHeading"
        class=${tw`mb-2 font-semibold ${splitView ? tw`flex-1` : "flex-grow-0"}`}
      >
        ${msg("Screenshot during crawl")}
      </h3>
      <h3
        id="qaScreenshotHeading"
        class=${tw`mb-2 font-semibold ${splitView ? tw`flex-1` : "flex-grow-0"}`}
      >
        ${msg("Screenshot from replay")}
      </h3>
    </div>
    ${splitView
      ? html` <div class=${tw`flex flex-col gap-2 md:flex-row`}>
          <div
            class=${tw`aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50`}
            aria-labelledby="crawlScreenshotHeading"
          >
            ${when(crawlData, image, renderSpinner)}
          </div>
          <div
            class=${tw`aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50`}
            aria-labelledby="qaScreenshotHeading"
          >
            ${when(qaData, image, renderSpinner)}
          </div>
        </div>`
      : html`
          <div
            class=${tw`aspect-video overflow-hidden rounded-lg border bg-slate-50`}
          >
            <sl-image-comparer>
              <img
                slot="after"
                src="${crawlData?.blobUrl || ""}"
                aria-labelledby="crawlScreenshotHeading"
              />
              <img
                slot="before"
                src="${qaData?.blobUrl || ""}"
                aria-labelledby="qaScreenshotHeading"
              />
            </sl-image-comparer>
          </div>
        `}
  `;
  return guard([crawlData, qaData, splitView], () => content);
}
