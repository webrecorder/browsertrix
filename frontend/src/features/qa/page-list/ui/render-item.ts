import { html, nothing } from "lit";

import type { PageList } from "..";
import { iconFor } from "../helpers/iconFor";
import { issueCounts, maxSeverity } from "../helpers/issueCounts";
import { severityFromMatch } from "../helpers/severity";

import { pageDetails } from "./page-details";

import type { ArchivedItemPage } from "@/types/crawler";

export const renderItem = (pageList: PageList) => (datum: ArchivedItemPage) =>
  pageList.itemPageId
    ? html`<btrix-qa-page
        class="is-leaf -my-4 scroll-my-8 py-4 [content-visibility:auto] [contain-intrinsic-height:auto_70px] [contain:strict] first-of-type:mt-0 last-of-type:mb-0"
        .selected=${pageList.itemPageId === datum.id}
        .pageId=${datum.id}
      >
        <div
          class="absolute -left-4 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border border-gray-300 bg-neutral-0 p-2 leading-[14px] shadow-sm"
        >
          ${iconFor(
            datum.approved ??
              (pageList.orderBy.field === "screenshotMatch" ||
              pageList.orderBy.field === "textMatch"
                ? severityFromMatch(
                    datum[pageList.orderBy.field]?.[pageList.itemPageId],
                  )
                : maxSeverity(datum, pageList.itemPageId)),
          )}
          ${issueCounts(datum, pageList.itemPageId).severe > 1
            ? html`<span class="text-[10px] font-semibold text-red-600"
                >+${issueCounts(datum, pageList.itemPageId).severe - 1}</span
              >`
            : issueCounts(datum, pageList.itemPageId).moderate > 1
              ? html`<span class="text-[10px] font-semibold text-yellow-600"
                  >+${issueCounts(datum, pageList.itemPageId).moderate -
                  1}</span
                >`
              : nothing}
          ${datum.notes?.[0] &&
          html`<sl-icon
            name="chat-square-text-fill"
            class="text-blue-600"
          ></sl-icon>`}
        </div>
        <h5 class="truncate text-sm font-semibold text-black">
          ${datum.title}
        </h5>
        <div class="truncate text-xs leading-4 text-blue-600">${datum.url}</div>
        <div
          slot="content"
          class="z-10 -mt-2 ml-6 mr-2 rounded-b-lg border border-solid border-gray-200 bg-neutral-0 px-4 pb-1 pt-4"
        >
          ${pageDetails(datum, pageList.itemPageId)}
        </div>
      </btrix-qa-page>`
    : null;
