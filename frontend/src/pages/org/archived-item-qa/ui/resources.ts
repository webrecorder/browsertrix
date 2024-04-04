import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";

import type { ReplayData, ResourcesPayload } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

const diffImport = import("diff");

function renderDiff(
  crawlResources: ResourcesPayload["resources"],
  qaResources: ResourcesPayload["resources"],
) {
  return until(
    diffImport.then(({ diffJson }) => {
      const diff = diffJson(crawlResources, qaResources);

      const addedText = tw`bg-red-100 text-red-700`;
      const removedText = tw`bg-red-100 text-red-100`;

      return html`
        <div
          class=${tw`flex-1 overflow-hidden whitespace-pre-line rounded-lg border-dashed p-4 first-of-type:border-r`}
          aria-labelledby="crawlResourcesHeading"
        >
          ${diff.map((part) => {
            return html`
              <span
                class=${part.added
                  ? removedText
                  : part.removed
                    ? addedText
                    : ""}
                >${part.value}</span
              >
            `;
          })}
        </div>
        <div
          class=${tw`flex-1 overflow-hidden whitespace-pre-line rounded-lg border-dashed p-4 first-of-type:border-r`}
          aria-labelledby="qaResourcesHeading"
        >
          ${diff.map((part) => {
            return html`
              <span
                class=${part.added
                  ? addedText
                  : part.removed
                    ? removedText
                    : ""}
                >${part.value}</span
              >
            `;
          })}
        </div>
      `;
    }),
  );
}

export function renderResources(crawlData: ReplayData, qaData: ReplayData) {
  const noData = html`<div
    class=${tw`flex flex-col items-center justify-center gap-2 text-xs text-neutral-500`}
  >
    <sl-icon name="slash-circle"></sl-icon>
    ${msg("Resources data not available")}
  </div>`;

  return html`
    <div class=${tw`flex h-full flex-col outline`}>
      <div class=${tw`mb-2 flex font-semibold`}>
        <h3 id="crawlResourcesHeading" class=${tw`flex-1`}>
          ${msg("Resources loaded during crawl")}
        </h3>
        <h3 id="qaResourcesHeading" class=${tw`flex-1`}>
          ${msg("Resources loaded in replay")}
        </h3>
      </div>
      <div
        class=${tw`flex-1 overflow-auto overscroll-contain rounded-lg border`}
      >
        ${guard([crawlData, qaData], () =>
          when(
            crawlData && qaData,
            () => html`
              <div
                class=${tw`flex min-h-full ${crawlData?.text && qaData?.text ? "" : tw`items-center justify-center`}`}
              >
                ${crawlData?.resources && qaData?.resources
                  ? renderDiff(crawlData.resources, qaData.resources)
                  : noData}
              </div>
            `,
            renderSpinner,
          ),
        )}
      </div>
    </div>
  `;
}
