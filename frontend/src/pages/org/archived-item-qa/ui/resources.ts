import { msg } from "@lit/localize";
import { html } from "lit";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { tw } from "@/utils/tailwind";

const diffImport = import("diff");

export function renderResources(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class=${tw`mb-2 flex justify-between text-base font-medium`}>
      <h3 id="crawlResourcesHeading">${msg("Crawl Resources")}</h3>
      <h3 id="replayResourcesHeading">${msg("Replay Resources")}</h3>
    </div>
    ${when(
      crawlData && qaData,
      () => html`
        <div class=${tw`flex border placeholder:rounded`}>
          ${until(
            diffImport.then(({ diffJson }) => {
              const diff = diffJson(crawlData.resources, qaData.resources);

              const addedText = tw`bg-red-100 text-red-700`;
              const removedText = tw`hidden`;

              return html`
                <div class=${tw`flex-1`}>
                  ${diff.map((part) => {
                    return html`
                      <div
                        class=${`${
                          part.added
                            ? removedText
                            : part.removed
                              ? addedText
                              : ""
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
                          part.added
                            ? addedText
                            : part.removed
                              ? removedText
                              : ""
                        } ${tw`whitespace-pre-line`}`}
                      >
                        ${part.value}
                      </div>
                    `;
                  })}
                </div>
              `;
            }),
          )}
        </div>
      `,
    )}
  `;
}
