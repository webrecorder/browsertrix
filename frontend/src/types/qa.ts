import type { ArchivedItemPage } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";

export type QARun = {
  id: string;
  userName: string;
  started: string; // date
  finished: string; // date
  state: CrawlState;
  crawlExecSeconds: number;
  stats: {
    found: number;
    done: number;
    size: number;
  };
  resources?: { crawlId: string; name: string; path: string }[];
  stopping?: boolean | null;
};

export type ArchivedItemQAPage = ArchivedItemPage & {
  qa: {
    screenshotMatch: number | null;
    textMatch: number | null;
    resourceCounts: {
      crawlGood: number;
      crawlBad: number;
      replayGood: number;
      replayBad: number;
    } | null;
  };
};
