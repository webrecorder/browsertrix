export type CrawlState =
  | "starting"
  | "running"
  | "complete"
  | "failed"
  | "partial_complete"
  | "timed_out"
  | "stopping"
  | "canceled";

export type Crawl = {
  id: string;
  userid: string;
  userName: string;
  aid: string;
  cid: string;
  configName: string;
  schedule: string;
  manual: boolean;
  started: string; // UTC ISO date
  finished?: string; // UTC ISO date
  state: CrawlState;
  scale: number;
  stats: { done: string; found: string } | null;
  resources?: { name: string; path: string; hash: string; size: number }[];
  fileCount?: number;
  fileSize?: number;
  completions?: number;
};

export type Seed = {
  scopeType:
    | "prefix"
    | "host"
    | "domain"
    | "page"
    | "page-spa"
    | "any"
    | "custom";
  include?: string[];
  exclude?: string[];
  limit?: number | null;
};

export type SeedConfig = Seed & {
  seeds: (string | ({ url: string } & Seed))[];
  extraHops?: number | null;
  lang?: string | null;
  blockAds?: boolean;
  behaviorTimeout?: number | null;
  behaviors?: string | null;
};

export type CrawlConfigParams = {
  name: string;
  schedule: string;
  scale: number;
  profileid: string | null;
  config: SeedConfig;
  crawlTimeout: number | null;
};

export type CrawlConfig = CrawlConfigParams & {
  id: string;
  userid: string;
  userName: string | null;
  created: string;
  crawlCount: number;
  lastCrawlId: string;
  lastCrawlTime: string;
  lastCrawlState: CrawlState;
  currCrawlId: string;
  newId: string | null;
  oldId: string | null;
  inactive: boolean;
  profileName: string | null;
};

export type Profile = {
  id: string;
  name: string;
  description: string;
  created: string;
  origins: string[];
  profileId: string;
  baseProfileName: string;
  aid: string;
  crawlconfigs: { id: string; name: string }[];
};
