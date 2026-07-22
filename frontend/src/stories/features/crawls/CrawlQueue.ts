import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

import type { CrawlQueue } from "@/features/archived-items/crawl-queue";

import "@/features/archived-items/crawl-queue";

export type RenderProps = CrawlQueue;

export const renderComponent = (props: Partial<RenderProps>) => {
  return html`<btrix-crawl-queue
    crawlId=${ifDefined(props.crawlId)}
    matchedTotal=${ifDefined(props.matchedTotal)}
    regex=${ifDefined(props.regex)}
    .exclusions=${props.exclusions || []}
  ></btrix-crawl-queue>`;
};
