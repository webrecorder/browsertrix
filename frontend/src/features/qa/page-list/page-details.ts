import type { ArchivedItemPage } from "@/types/crawler";
import { tw } from "@/utils/tailwind";
import { msg } from "@lit/localize";
import { html, nothing } from "lit";
import {
  severityIcon,
  severityFromMatch,
  severityFromResourceCounts,
  crawlCounts,
} from "./helpers";

export const pageDetails = (page: ArchivedItemPage, run: string) =>
  html`<ul class="text-xs leading-4">
      <li class="my-3 flex">
        ${severityIcon(
          severityFromMatch(page.screenshotMatch?.[run]),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.screenshotMatch?.[run] != null
            ? html`<span class="font-bold">${page.screenshotMatch[run]}%</span>
                ${msg("Screenshot Match")}`
            : msg("No Screenshot Diff")}
        </span>
      </li>
      <li class="my-3 flex">
        ${severityIcon(
          severityFromMatch(page.textMatch?.[run]),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.textMatch?.[run] != null
            ? html`<span class="font-bold">${page.textMatch[run]}%</span> ${msg(
                  "Extracted Text Match",
                )}`
            : msg("No Extracted Text Diff")}
        </span>
      </li>
      <li class="my-3 flex">
        ${severityIcon(
          severityFromResourceCounts(
            page.resourceCounts?.[run].crawlBad,
            page.resourceCounts?.[run].crawlGood,
          ),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.resourceCounts?.[run].crawlBad != null &&
          page.resourceCounts[run].crawlGood != null
            ? html`<span class="font-bold"
                  >${crawlCounts(
                    page.resourceCounts[run].crawlBad,
                    page.resourceCounts[run].crawlGood,
                  )}</span
                >
                ${msg("Resources Loaded (Crawl)")}` // TODO pluralize
            : msg("No Crawl Diff")}
        </span>
      </li>
      <li class="my-3 flex">
        ${severityIcon(
          severityFromResourceCounts(
            page.resourceCounts?.[run].replayBad,
            page.resourceCounts?.[run].replayGood,
          ),
          tw`mr-2 flex-none`,
        )}
        <span class="inline-block">
          ${page.resourceCounts?.[run].replayBad != null &&
          page.resourceCounts[run].replayGood != null
            ? html`<span class="font-bold"
                  >${crawlCounts(
                    page.resourceCounts[run].replayBad,
                    page.resourceCounts[run].replayGood,
                  )}</span
                >
                ${msg("Resources Loaded (Replay)")}` // TODO pluralize
            : msg("No Replay Diff")}
        </span>
      </li>
    </ul>
    ${page.notes?.[0]
      ? html` <sl-divider
            class="[--color:theme(colors.gray.200)] [--spacing:theme(spacing.3)]"
          ></sl-divider>
          <ul class="text-xs leading-4">
            ${page.notes.map(
              (note) => html`
                <li class="my-3 flex">
                  <sl-icon
                    name="chat-square-text-fill"
                    class="mr-2 h-4 w-4 flex-none text-blue-600"
                  ></sl-icon>
                  ${note.text}
                </li>
              `,
            )}
          </ul>`
      : nothing}`;
