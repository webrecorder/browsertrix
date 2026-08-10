import { type ActiveCrawlCounts } from "./types";

export type BtrixUpdateActiveCrawlsCount = CustomEvent<ActiveCrawlCounts>;

declare global {
  interface GlobalEventHandlersEventMap {
    "btrix-update-active-crawls-count": BtrixUpdateActiveCrawlsCount;
  }
}

export const makeUpdateActiveCrawlsCountEvent = (
  detail: BtrixUpdateActiveCrawlsCount["detail"],
) => {
  return new CustomEvent<BtrixUpdateActiveCrawlsCount["detail"]>(
    "btrix-update-active-crawls-count",
    {
      detail,
      composed: true,
      bubbles: true,
    },
  );
};
