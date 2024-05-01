import { msg } from "@lit/localize";
import type { SlRequestCloseEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { QATab, ReplayData } from "../types";

import { renderSpinner } from "./spinner";

import type { Dialog } from "@/components/ui/dialog";
import { tw } from "@/utils/tailwind";

export function renderReplay(crawlData: ReplayData, tab: QATab) {
  return html`
    <div class="replayContainer ${tw`h-full [contain:paint]`}">
      <div
        class=${tw`relative h-full overflow-hidden rounded-b-lg border-x border-b bg-slate-100 p-4 shadow-inner md:min-h-[80vh]`}
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

                  void iframe
                    .closest(".replayContainer")
                    ?.querySelector<Dialog>("btrix-dialog.loadingPageDialog")
                    ?.hide();
                  /// Prevent anchor tag navigation
                  iframe.contentDocument?.querySelectorAll("a").forEach((a) => {
                    a.addEventListener("click", (e: MouseEvent) => {
                      e.preventDefault();
                      void iframe
                        .closest(".replayContainer")
                        ?.querySelector<Dialog>(
                          "btrix-dialog.clickPreventedDialog",
                        )
                        ?.show();
                    });
                  });
                }}
              ></iframe>`,
            renderSpinner,
          ),
        )}
      </div>
      <btrix-dialog
        class="loadingPageDialog"
        ?open=${tab === "replay"}
        no-header
        @sl-request-close=${(e: SlRequestCloseEvent) => e.preventDefault()}
      >
        <div class="sr-only">${msg("Loading page")}</div>
        <sl-progress-bar
          indeterminate
          class="[--height:0.5rem]"
        ></sl-progress-bar>
      </btrix-dialog>
      <btrix-dialog
        class="clickPreventedDialog"
        .label=${msg("Click prevented")}
      >
        ${msg("Clicking links during review is disabled.")}
      </btrix-dialog>
    </div>
  `;
}
