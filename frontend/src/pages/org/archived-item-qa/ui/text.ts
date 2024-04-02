import { msg } from "@lit/localize";
import { html } from "lit";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { tw } from "@/utils/tailwind";

const diffImport = import("diff");

export function renderText(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class=${tw`mb-2 flex justify-between text-base font-medium`}>
      <h3 id="crawlTextHeading">${msg("Crawl Text")}</h3>
      <h3 id="replayTextHeading">${msg("Replay Text")}</h3>
    </div>
    ${when(
      crawlData && qaData,
      () => html`
        <div class=${tw`flex border placeholder:rounded`}>
          ${until(
            diffImport.then(({ diffChars }) => {
              const diff = diffChars(crawlData.text, qaData.text);

              const addedText = tw`bg-red-100 text-red-700`;
              const removedText = tw`bg-red-100 text-red-100`;

              return html`
                <div class=${tw`flex-1 whitespace-pre-line`}>
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
                <div class=${tw`flex-1 whitespace-pre-line`}>
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
          )}
        </div>
      `,
    )}
  `;
}
