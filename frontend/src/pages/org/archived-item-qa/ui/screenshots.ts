import { msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { BlobPayload, ReplayData } from "../types";

import { renderSpinner } from "./spinner";

function image(blobUrl: BlobPayload["blobUrl"]) {
  if (!blobUrl) {
    return html`<div
      class="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-neutral-500"
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

export function renderScreenshots(
  crawlData: ReplayData,
  qaData: ReplayData,
  splitView: boolean,
) {
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
            ${when(
              crawlData?.blobUrl !== undefined && crawlData.blobUrl,
              image,
              renderSpinner,
            )}
          </div>
          <div
            class="aspect-video flex-1 overflow-hidden rounded-lg border bg-slate-50"
            aria-labelledby="qaScreenshotHeading"
          >
            ${when(
              qaData?.blobUrl !== undefined && qaData.blobUrl,
              image,
              renderSpinner,
            )}
          </div>
        </div>`
      : html`
          <div
            class="aspect-video overflow-hidden rounded-lg border bg-slate-50"
          >
            <sl-image-comparer class="h-full w-full">
              <div slot="after" aria-labelledby="crawlScreenshotHeading">
                ${when(
                  crawlData?.blobUrl !== undefined && crawlData.blobUrl,
                  image,
                  renderSpinner,
                )}
              </div>
              <div slot="before" aria-labelledby="qaScreenshotHeading">
                ${when(
                  qaData?.blobUrl !== undefined && qaData.blobUrl,
                  image,
                  renderSpinner,
                )}
              </div>
            </sl-image-comparer>
          </div>
        `}
  `;
  return guard([crawlData, qaData, splitView], () => content);
}
