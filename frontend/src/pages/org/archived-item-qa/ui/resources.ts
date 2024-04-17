import { msg } from "@lit/localize";
import { html } from "lit";

import type { ReplayData, ResourcesPayload } from "../types";

import { tw } from "@/utils/tailwind";

function renderDiff(
  crawlResources: ResourcesPayload["resources"],
  qaResources: ResourcesPayload["resources"],
) {
  const columns = [
    msg("Resource Type"),
    msg("Good During Crawl"),
    msg("Bad During Crawl"),
    msg("Good in Replay"),
    msg("Bad in Replay"),
  ];
  const rows = Object.keys(crawlResources).map((key) => [
    html`<span class=${tw`capitalize`}>${key}</span>`,
    html`${crawlResources[key].good.toLocaleString()}`,
    html`${crawlResources[key].bad.toLocaleString()}`,
    html`${qaResources[key].good.toLocaleString()}`,
    html`${qaResources[key].bad.toLocaleString()}`,
  ]);

  return html`
    <btrix-data-table .columns=${columns} .rows=${rows}></btrix-data-table>
  `;
}

export function renderResources(crawlData: ReplayData, qaData: ReplayData) {
  const noData = html`<div
    class=${tw`flex flex-col items-center justify-center gap-2 text-xs text-neutral-500`}
  >
    <sl-icon name="slash-circle"></sl-icon>
    ${msg("Resources data not available")}
  </div>`;

  return html`
    <div class=${tw`flex h-full flex-col outline`}>
      <div class=${tw`mb-2 flex font-semibold`}>
        <h3 id="crawlResourcesHeading" class=${tw`flex-1`}>
          ${msg("Resources loaded during crawl")}
        </h3>
        <h3 id="qaResourcesHeading" class=${tw`flex-1`}>
          ${msg("Resources loaded in replay")}
        </h3>
      </div>
      <div
        class=${tw`flex-1 overflow-auto overscroll-contain rounded-lg border`}
      >
        ${crawlData?.resources && qaData?.resources
          ? renderDiff(crawlData.resources, qaData.resources)
          : noData}
      </div>
    </div>
  `;
}
