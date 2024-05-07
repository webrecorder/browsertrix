import { msg } from "@lit/localize";
import type { SlRequestCloseEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { guard } from "lit/directives/guard.js";
import { when } from "lit/directives/when.js";

import type { QATab, ReplayData } from "../types";

import type { Dialog } from "@/components/ui/dialog";
import { tw } from "@/utils/tailwind";

export function renderReplay(crawlData: ReplayData, tab: QATab) {
  return html`
    <div
      class="replayContainer ${tw`h-full min-h-96 [contain:paint] lg:min-h-0 lg:pb-3`}"
    >
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
                class=${tw`h-full w-full overflow-hidden overscroll-contain rounded-lg border bg-neutral-0 shadow-lg`}
                @load=${async (e: Event) => {
                  // NOTE This is all pretty hacky. To be improved with
                  // https://github.com/webrecorder/browsertrix/issues/1780

                  const iframe = e.currentTarget as HTMLIFrameElement;
                  const iframeContainer = iframe.closest(".replayContainer");
                  const showDialog = async () => {
                    await iframeContainer
                      ?.querySelector<Dialog>(
                        "btrix-dialog.clickPreventedDialog",
                      )
                      ?.show();
                  };

                  // Hide loading indicator
                  void iframeContainer
                    ?.querySelector<Dialog>("btrix-dialog.loadingPageDialog")
                    ?.hide();

                  // Prevent anchor tag navigation
                  iframe.contentDocument?.querySelectorAll("a").forEach((a) => {
                    a.addEventListener("click", (e: MouseEvent) => {
                      e.preventDefault();
                      void showDialog();
                    });
                  });

                  if (
                    iframe.contentWindow?.location.href.slice(
                      iframe.contentWindow.location.href.indexOf("mp_/"),
                    ) !== replayUrl.slice(replayUrl.indexOf("mp_/"))
                  ) {
                    await showDialog();
                    iframe.contentWindow?.history.back();
                  }
                }}
              ></iframe>`,
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
        .label=${msg("Navigation prevented")}
      >
        ${msg("Following links during review is disabled.")}
      </btrix-dialog>
    </div>
  `;
}
