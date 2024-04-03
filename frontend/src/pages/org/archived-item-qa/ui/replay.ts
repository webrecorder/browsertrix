import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

export function renderReplay(crawlData: ReplayData) {
  return html`
    <div
      class=${tw`relative aspect-video overflow-hidden rounded-b-lg border-x border-b`}
    >
      ${guard([crawlData], () =>
        when(
          crawlData?.replayUrl,
          (replayUrl) =>
            html`<iframe
              src=${replayUrl}
              class=${tw`h-full w-full outline`}
            ></iframe>`,
          renderSpinner,
        ),
      )}
    </div>
  `;
}
