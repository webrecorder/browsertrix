import { msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";

import type { BlobPayload, ReplayData } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

function image(blobUrl: BlobPayload["blobUrl"] | undefined) {
  if (!blobUrl) {
    return html`<div
      class="flex aspect-video h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-xs text-neutral-500"
    >
      <sl-icon name="slash-circle"></sl-icon>
      ${msg("Screenshot not available")}
    </div>`;
  }
  return html`
    <img
      class="h-full w-full"
      width="1920"
      height="1080"
      alt=""
      src=${blobUrl}
    />
  `;
}

const imageSpinner = renderSpinner(tw`aspect-video bg-slate-50`);

export const renderImage = (data: ReplayData | null) =>
  guard(data, () => (data != null ? image(data.blobUrl) : imageSpinner));

export function renderScreenshots(
  crawlData: ReplayData,
  qaData: ReplayData,
  splitView: boolean,
) {
  const crawlImage = renderImage(crawlData);
  const qaImage = renderImage(qaData);
  const content = html`
    <div class=${clsx("flex", !splitView && "justify-between")}>
      <h3
        id="crawlScreenshotHeading"
        class=${clsx(
          "mb-2 font-semibold",
          splitView ? "flex-1" : "flex-grow-0",
        )}
      >
        ${msg("Screenshot during crawl")}
      </h3>
      <h3
        id="qaScreenshotHeading"
        class=${clsx(
          "mb-2 font-semibold",
          splitView ? "flex-1" : "flex-grow-0",
        )}
      >
        ${msg("Screenshot during analysis")}
      </h3>
    </div>
    ${splitView
      ? html` <div class="flex flex-col gap-2 md:flex-row">
          <div
            class="aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50"
            aria-labelledby="crawlScreenshotHeading"
          >
            ${crawlImage}
          </div>
          <div
            class="aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50"
            aria-labelledby="qaScreenshotHeading"
          >
            ${qaImage}
          </div>
        </div>`
      : html`
          <div
            class="aspect-video overflow-hidden rounded-lg border bg-slate-50"
          >
            <sl-image-comparer class="h-full w-full">
              <div slot="after" aria-labelledby="crawlScreenshotHeading">
                ${crawlImage}
              </div>
              <div slot="before" aria-labelledby="qaScreenshotHeading">
                ${qaImage}
              </div>
            </sl-image-comparer>
          </div>
        `}
  `;
  return guard([crawlData, qaData, splitView], () => content);
}
