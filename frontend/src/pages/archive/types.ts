export type CrawlTemplate = {
  id?: string;
  name: string;
  schedule: string;
  runNow: boolean;
  crawlTimeout?: number;
  config: {
    seeds: string[];
    scopeType?: string;
    limit?: number;
  };
};
