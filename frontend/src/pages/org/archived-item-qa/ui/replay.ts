import { msg } from "@lit/localize";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { ReplayData } from "../types";

import { renderSpinner } from "./spinner";

import type { Dialog } from "@/components/ui/dialog";
import { tw } from "@/utils/tailwind";

export function renderReplay(crawlData: ReplayData) {
  console.log("crawlData?.replayUrl", crawlData?.replayUrl);
  return html`
    <div class="replayContainer ${tw`h-full [contain:paint]`}">
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
                @load=${(e: Event) => {
                  const iframe = e.currentTarget as HTMLIFrameElement;

                  /// Prevent anchor tag navigation
                  iframe.contentDocument?.querySelectorAll("a").forEach((a) => {
                    a.addEventListener("click", (e: MouseEvent) => {
                      e.preventDefault();
                      void iframe
                        .closest(".replayContainer")
                        ?.querySelector<Dialog>("btrix-dialog")
                        ?.show();
                    });
                  });
                }}
              ></iframe>`,
            renderSpinner,
          ),
        )}
      </div>
      <btrix-dialog .label=${msg("Click prevented")}>
        ${msg("Clicking links within Replay is currently disabled.")}
      </btrix-dialog>
    </div>
  `;
}
