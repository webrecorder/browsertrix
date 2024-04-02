import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { tw } from "@/utils/tailwind";

const diffImport = import("diff");

function renderDiff(
  crawlResources: ReplayData["resources"],
  qaResources: ReplayData["resources"],
) {
  return until(
    diffImport.then(({ diffJson }) => {
      const diff = diffJson(crawlResources, qaResources);

      const addedText = tw`bg-red-100 text-red-700`;
      const removedText = tw`hidden`;

      return html`
        <div class=${tw`flex-1`}>
          ${diff.map((part) => {
            return html`
              <div
                class=${`${
                  part.added ? removedText : part.removed ? addedText : ""
                } ${tw`whitespace-pre-line`}`}
              >
                ${part.value}
              </div>
            `;
          })}
        </div>
        <div class=${tw`flex-1`}>
          ${diff.map((part) => {
            return html`
              <div
                class=${`${
                  part.added ? addedText : part.removed ? removedText : ""
                } ${tw`whitespace-pre-line`}`}
              >
                ${part.value}
              </div>
            `;
          })}
        </div>
      `;
    }),
  );
}

export function renderResources(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class=${tw`mb-2 flex justify-between text-base font-medium`}>
      <h3 id="crawlResourcesHeading">${msg("Crawl Resources")}</h3>
      <h3 id="replayResourcesHeading">${msg("Replay Resources")}</h3>
    </div>
    ${guard(
      [crawlData, qaData],
      () => html`
        <div class=${tw`flex border placeholder:rounded`}>
          ${when(crawlData.resources && qaData.resources, () =>
            renderDiff(crawlData.resources, qaData.resources),
          )}
        </div>
      `,
    )}
  `;
}
