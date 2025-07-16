import { msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";

import type { ReplayData, ResourcesPayload } from "../types";

import { renderSpinner } from "./spinner";

import localize from "@/utils/localize";
import { tw } from "@/utils/tailwind";

const TOTAL = "Total";

function resourceTable(
  crawlResources: ResourcesPayload["resources"],
  qaResources?: ResourcesPayload["resources"],
) {
  const columns = [
    msg("Resource Type"),
    msg("Good During Crawl"),
    msg("Bad During Crawl"),
  ];

  if (qaResources) {
    columns.push(msg("Good During Analysis"), msg("Bad During Analysis"));
  }

  let rows = [
    [
      html`<span class="font-semibold capitalize"
        >${msg("All Resources")}</span
      >`,
      html`<span class="font-semibold"
        >${localize.number(crawlResources[TOTAL].good)}</span
      >`,
      html`<span class="font-semibold"
        >${localize.number(crawlResources[TOTAL].bad)}</span
      >`,
    ],
  ];

  if (qaResources) {
    rows[0].push(
      html`<span
        class="${clsx(
          "font-semibold",
          crawlResources[TOTAL].good !== qaResources[TOTAL].good
            ? "text-danger"
            : "text-neutral-700",
        )}"
      >
        ${localize.number(qaResources[TOTAL].good)}
      </span>`,
      html`<span
        class="${clsx(
          "font-semibold",
          crawlResources[TOTAL].bad !== qaResources[TOTAL].bad
            ? "text-danger"
            : "text-neutral-700",
        )}"
      >
        ${localize.number(qaResources[TOTAL].bad)}
      </span>`,
    );
    rows = [
      ...rows,
      ...Object.keys(qaResources)
        .filter((key) => key !== TOTAL)
        .map((key) => [
          html`<span class="capitalize">${key}</span>`,
          html`${Object.prototype.hasOwnProperty.call(crawlResources, key)
            ? localize.number(crawlResources[key].good)
            : 0}`,
          html`${Object.prototype.hasOwnProperty.call(crawlResources, key)
            ? localize.number(crawlResources[key].bad)
            : 0}`,
          html`<span
            class=${Object.prototype.hasOwnProperty.call(crawlResources, key) &&
            crawlResources[key].good === qaResources[key].good
              ? tw`text-neutral-400`
              : tw`text-danger`}
          >
            ${localize.number(qaResources[key].good)}
          </span>`,
          html`<span
            class=${Object.prototype.hasOwnProperty.call(crawlResources, key) &&
            crawlResources[key].bad === qaResources[key].bad
              ? tw`text-neutral-400`
              : tw`font-semibold text-danger`}
          >
            ${localize.number(qaResources[key].bad)}
          </span>`,
        ]),
    ];
  }

  return html`
    <btrix-data-table
      class="block"
      .columns=${columns}
      .rows=${rows}
    ></btrix-data-table>
  `;
}

function resourceLegend() {
  return html`
    <dl>
      <div class="flex gap-1">
        <dt class="font-semibold">${msg("Good:")}</dt>
        <dd>${msg("Success (2xx) and Redirection (3xx) status codes")}</dd>
      </div>
      <div class="flex gap-1">
        <dt class="font-semibold">${msg("Bad:")}</dt>
        <dd>
          ${msg("Client error (4xx) and Server error (5xx) status codes")}
        </dd>
      </div>
    </dl>
  `;
}

export function renderResources(data: ReplayData) {
  return html`<div class="flex h-full flex-col">
    <div class="flex-1 overflow-auto overscroll-contain">
      ${data?.resources ? resourceTable(data.resources) : renderSpinner()}
    </div>
    <footer class="pt-2 text-xs text-neutral-600">${resourceLegend()}</footer>
  </div>`;
}

export function renderResourceDiff(crawlData: ReplayData, qaData: ReplayData) {
  // const noData = html`<div
  //   class="m-4 flex flex-col items-center justify-center gap-2 text-xs text-neutral-500"
  // >
  //   <sl-icon name="slash-circle"></sl-icon>
  //   ${msg("Resources data not available")}
  // </div>`;

  return html`
    <div class="flex h-full flex-col">
      <div class="flex-1 overflow-auto overscroll-contain">
        ${crawlData?.resources && qaData?.resources
          ? resourceTable(crawlData.resources, qaData.resources)
          : renderSpinner()}
      </div>
      <footer class="pt-2 text-xs text-neutral-600">${resourceLegend()}</footer>
    </div>
  `;
}
