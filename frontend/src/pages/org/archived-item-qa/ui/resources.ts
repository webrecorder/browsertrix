import { msg } from "@lit/localize";
import { html } from "lit";

import type { ReplayData, ResourcesPayload } from "../types";

import { renderSpinner } from "./spinner";

import { tw } from "@/utils/tailwind";

const TOTAL = "Total";

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
  const rows = [
    [
      html`<span class=${tw`font-semibold capitalize`}
        >${msg("All Resources")}</span
      >`,
      html`<span class=${tw`font-semibold`}
        >${crawlResources[TOTAL].good.toLocaleString()}</span
      >`,
      html`<span class=${tw`font-semibold`}
        >${crawlResources[TOTAL].bad.toLocaleString()}</span
      >`,
      html`<span
        class="${tw`font-semibold`} ${crawlResources[TOTAL].good !==
        qaResources[TOTAL].good
          ? tw`text-danger`
          : tw`text-neutral-700`}"
      >
        ${qaResources[TOTAL].good.toLocaleString()}
      </span>`,
      html`<span
        class="${tw`font-semibold`} ${crawlResources[TOTAL].bad !==
        qaResources[TOTAL].bad
          ? tw`text-danger`
          : tw`text-neutral-700`}"
      >
        ${qaResources[TOTAL].bad.toLocaleString()}
      </span>`,
    ],
    ...Object.keys(crawlResources)
      .filter((key) => key !== TOTAL)
      .map((key) => [
        html`<span class=${tw`capitalize`}>${key}</span>`,
        html`${crawlResources[key].good.toLocaleString()}`,
        html`${crawlResources[key].bad.toLocaleString()}`,
        html`<span
          class=${crawlResources[key].good !== qaResources[key].good
            ? tw`text-danger`
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
      ]),
  ];

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
      <div class=${tw`flex-1 overflow-auto overscroll-contain pb-3`}>
        ${crawlData && qaData
          ? crawlData.resources && qaData.resources
            ? renderDiff(crawlData.resources, qaData.resources)
            : noData
          : renderSpinner()}
      </div>
      <footer class=${tw`border-t pt-2 text-xs text-neutral-600`}>
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
