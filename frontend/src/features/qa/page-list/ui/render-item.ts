import { html, nothing } from "lit";

import { iconFor } from "../helpers/iconFor";
import { issueCounts, maxSeverity } from "../helpers/issueCounts";
import { approvalFromPage } from "../helpers/reviewStatus";
import { severityFromMatch } from "../helpers/severity";
import type { PageList } from "../page-list";

import { pageDetails } from "./page-details";

import type { ArchivedItemPage } from "@/types/crawler";
import { cached } from "@/utils/weakCache";

export const renderItem = (pageList: PageList) =>
  cached((page: ArchivedItemPage) => {
    const runId = pageList.qaRunId ?? "";

    let { severe, moderate } = issueCounts(page, runId);

    const statusIcon =
      approvalFromPage(page) ??
      {
        screenshotMatch: severityFromMatch(page.screenshotMatch?.[runId]),
        textMatch: severityFromMatch(page.textMatch?.[runId]),
        approved: approvalFromPage(page) ?? maxSeverity(page, runId),
      }[pageList.orderBy.field];

    if (statusIcon === "severe") severe--;
    if (statusIcon === "moderate") moderate--;

    return html`<btrix-qa-page
      class="is-leaf -my-4 scroll-my-8 py-4 [contain-intrinsic-height:auto_70px] [contain:strict] [content-visibility:auto] first-of-type:mt-0 last-of-type:mb-0"
      .selected=${pageList.itemPageId === page.id}
      .pageId=${page.id}
    >
      <div
        class="absolute -left-4 top-[50%] flex w-8 translate-y-[-50%] flex-col place-items-center gap-1 rounded-full border border-gray-300 bg-neutral-0 p-2 leading-[14px] shadow-sm"
      >
        ${iconFor(statusIcon)}
        ${severe > 0
          ? html`<span class="text-[10px] font-semibold text-red-600"
              >+${severe}</span
            >`
          : moderate > 0
            ? html`<span class="text-[10px] font-semibold text-yellow-600"
                >+${moderate}</span
              >`
            : nothing}
        ${page.notes?.[0] &&
        html`<sl-icon
          name="chat-square-text-fill"
          class="text-blue-600"
        ></sl-icon>`}
      </div>
      <h5 class="truncate text-sm font-semibold text-black">${page.title}</h5>
      <div class="truncate text-xs leading-4 text-blue-600">${page.url}</div>
      <div
        slot="content"
        class="z-10 -mt-2 ml-6 mr-2 rounded-b-lg border border-solid border-gray-200 bg-neutral-0 px-4 pb-1 pt-4"
      >
        ${pageDetails(page, runId)}
      </div>
    </btrix-qa-page>`;
  });
