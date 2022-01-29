export type Crawl = {
  id: string;
  user: string;
  username: string;
  aid: string;
  cid: string;
  configName: string;
  schedule: string;
  manual: boolean;
  started: string; // UTC ISO date
  finished?: string; // UTC ISO date
  state: string; // "running" | "complete" | "failed" | "partial_complete"
  scale: number;
  stats: { done: number; found: number } | null;
  files?: { filename: string; hash: string; size: number }[];
  fileCount?: number;
  fileSize?: number;
  completions?: number;
};

type SeedConfig = {
  scopeType?: string;
  limit?: number;
  extraHops?: number;
};

export type CrawlConfig = {
  seeds: (string | ({ url: string } & SeedConfig))[];
} & SeedConfig;

export type CrawlTemplate = {
  id: string;
  name: string;
  schedule: string;
  userid: string;
  userName?: string;
  created: string;
  crawlCount: number;
  lastCrawlId: string;
  lastCrawlTime: string;
  currCrawlId: string;
  config: CrawlConfig;
};
