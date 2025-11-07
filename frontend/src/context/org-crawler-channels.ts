import { createContext } from "@lit/context";

import type { CrawlerChannel } from "@/types/crawler";

export type OrgCrawlerChannelsContext = CrawlerChannel[] | null;

export const orgCrawlerChannelsContext =
  createContext<OrgCrawlerChannelsContext>("org-crawler-channels");
