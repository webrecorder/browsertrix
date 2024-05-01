import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

export function renderReplay(crawlData: ReplayData) {
  return html`
    <div
      class=${tw`relative h-full overflow-hidden rounded-b-lg border-x border-b bg-slate-100 p-4 shadow-inner`}
    >
      ${guard([crawlData], () =>
        when(
          crawlData?.replayUrl,
          (replayUrl) =>
            html`<iframe
              id="interactiveReplayFrame"
              src=${replayUrl}
              class=${tw`h-full w-full overflow-hidden rounded border bg-neutral-0 shadow-lg`}
            ></iframe>`,
          renderSpinner,
        ),
      )}
    </div>
  `;
}
