import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { until } from "lit/directives/until.js";
import { when } from "lit/directives/when.js";

import type { ReplayData, TextPayload } from "../types";

import { tw } from "@/utils/tailwind";

const diffImport = import("diff");

function renderDiff(
  crawlText: TextPayload["text"],
  qaText: TextPayload["text"],
) {
  return until(
    diffImport.then(({ diffWords }) => {
      const diff = diffWords(crawlText, qaText);

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
  );
}

export function renderText(crawlData: ReplayData, qaData: ReplayData) {
  return html`
    <div class=${tw`mb-2 flex justify-between text-base font-medium`}>
      <h3 id="crawlTextHeading">${msg("Crawl Text")}</h3>
      <h3 id="replayTextHeading">${msg("Replay Text")}</h3>
    </div>
    ${guard(
      [crawlData, qaData],
      () => html`
        <div class=${tw`flex border placeholder:rounded`}>
          ${when(crawlData?.text && qaData?.text, () =>
            renderDiff(crawlData!.text!, qaData!.text!),
          )}
        </div>
      `,
    )}
  `;
}
