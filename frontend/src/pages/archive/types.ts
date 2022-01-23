export type CrawlConfig = {
  seeds: string[];
  scopeType?: string;
  limit?: number;
};

export type CrawlTemplate = {
  id: string;
  name: string;
  schedule: string;
  user: string;
  crawlCount: number;
  lastCrawlId: string;
  lastCrawlTime: string;
  currCrawlId: string;
  config: CrawlConfig;
};
