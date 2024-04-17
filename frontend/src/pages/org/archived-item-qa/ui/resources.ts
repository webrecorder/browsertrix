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
    html`<span
      class=${crawlResources[key].good !== qaResources[key].good
        ? tw`font-semibold text-danger`
        : tw`text-neutral-400`}
    >
      ${qaResources[key].good.toLocaleString()}
    </span>`,
    html`<span
      class=${crawlResources[key].bad !== qaResources[key].bad
        ? tw`font-semibold text-danger`
        : tw`text-neutral-400`}
    >
      ${qaResources[key].bad.toLocaleString()}
    </span>`,
  ]);

  return html`
    <btrix-data-table .columns=${columns} .rows=${rows}></btrix-data-table>
  `;
}

export function renderResources(crawlData: ReplayData, qaData: ReplayData) {
  const noData = html`<div
    class=${tw`flex h-full flex-col items-center justify-center gap-2 text-xs text-neutral-500`}
  >
    <sl-icon name="slash-circle"></sl-icon>
    ${msg("Resources data not available")}
  </div>`;

  return html`
    <div class=${tw`flex h-full flex-col outline`}>
      <div
        class=${tw`flex-1 overflow-auto overscroll-contain rounded-lg border`}
      >
        ${crawlData?.resources && qaData?.resources
          ? renderDiff(crawlData.resources, qaData.resources)
          : noData}
      </div>
      <footer class=${tw`mt-3 text-xs text-neutral-600`}>
        <p class=${tw`mb-2`}>
          ${msg('"Good" and "Bad" indicates the status code of the resource.')}
        </p>
        <dl>
          <div class=${tw`flex gap-1`}>
            <dt class=${tw`font-semibold`}>${msg("Good:")}</dt>
            <dd>${msg("Status code between 200-399")}</dd>
          </div>
          <div class=${tw`flex gap-1`}>
            <dt class=${tw`font-semibold`}>${msg("Bad:")}</dt>
            <dd>${msg("Status code between 400-599")}</dd>
          </div>
        </dl>
      </footer>
    </div>
  `;
}
