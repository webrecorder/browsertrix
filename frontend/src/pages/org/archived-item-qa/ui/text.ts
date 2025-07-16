import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";

import type { ReplayData, TextPayload } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

const diffImport = import("diff");

function renderDiff(
  crawlText: TextPayload["text"],
  qaText: TextPayload["text"],
) {
  return until(
    diffImport.then(({ diffWords }) => {
      const diff = diffWords(crawlText, qaText);

      const addedText = tw`bg-red-100 text-red-700 no-underline`;
      const removedText = tw`bg-red-100 text-red-100`;

      return html`
        <div
          class=${tw`flex-1 overflow-hidden border-dashed p-4 first-of-type:border-r`}
          aria-labelledby="crawlTextHeading"
        >
          ${diff.map((part) => {
            if (part.added) {
              return html`<del
                aria-label="${msg("Missing text: Crawl")}"
                class="${removedText}"
                >${part.value}</del
              >`;
            } else if (part.removed) {
              return html`<ins
                aria-label="${msg("Added text: Crawl")}"
                class="${addedText}"
                >${part.value}</ins
              >`;
            } else {
              return html`<span aria-label="${msg("Identical text")}"
                >${part.value}</span
              >`;
            }
          })}
        </div>
        <div
          class=${tw`flex-1 overflow-hidden border-dashed p-4 first-of-type:border-r`}
          aria-labelledby="qaTextHeading"
        >
          ${diff.map((part) => {
            if (part.added) {
              return html`<ins
                aria-label="${msg("Added text: Analysis")}"
                class="${addedText}"
                >${part.value}</ins
              >`;
            } else if (part.removed) {
              return html`<del
                aria-label="${msg("Missing text: Analysis")}"
                class="${removedText}"
                >${part.value}</del
              >`;
            } else {
              return html`<span aria-label="${msg("Identical text")}"
                >${part.value}</span
              >`;
            }
          })}
        </div>
      `;
    }),
  );
}

const noData = () =>
  html`<div
    class="m-4 flex flex-col items-center justify-center gap-2 text-xs text-neutral-500"
  >
    <sl-icon name="slash-circle"></sl-icon>
    ${msg("Text data not available")}
  </div>`;

export function renderText(data: ReplayData) {
  return html`<div class="h-full flex-col overflow-hidden rounded-lg border">
    ${when(
      data,
      ({ text }) =>
        text !== undefined
          ? html`<div class="h-full overflow-auto overscroll-contain p-3">
              ${text}
            </div>`
          : noData(),
      renderSpinner,
    )}
  </div>`;
}

export function renderTextDiff(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class=${tw`flex h-full flex-col`}>
      <div class=${tw`mb-2 flex font-semibold`}>
        <h3 id="crawlTextHeading" class=${tw`flex-1`}>
          ${msg("Text extracted during crawl")}
        </h3>
        <h3 id="qaTextHeading" class=${tw`flex-1`}>
          ${msg("Text extracted during analysis")}
        </h3>
      </div>
      <div class="flex-1 overflow-hidden rounded-lg border">
        <div class=${tw`h-full overflow-auto overscroll-contain`}>
          ${guard([crawlData, qaData], () =>
            when(
              crawlData?.text !== undefined && qaData?.text !== undefined,
              () => html`
                <div
                  class=${tw`flex min-h-full ${crawlData?.text && qaData?.text ? "" : tw`items-center justify-center`}`}
                >
                  ${crawlData?.text && qaData?.text
                    ? renderDiff(crawlData.text, qaData.text)
                    : noData()}
                </div>
              `,
              renderSpinner,
            ),
          )}
        </div>
      </div>
    </div>
  `;
}
