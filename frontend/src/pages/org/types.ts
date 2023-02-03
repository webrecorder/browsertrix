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
  oid: string;
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
  tags?: string[];
};

type ScopeType =
  | "prefix"
  | "host"
  | "domain"
  | "page"
  | "page-spa"
  | "any"
  | "custom";

export type Seed = {
  url: string;
  scopeType: ScopeType;
  include?: string[];
  exclude?: string[];
  limit?: number | null;
  extraHops?: number | null;
};

export type SeedConfig = Pick<
  Seed,
  "scopeType" | "include" | "exclude" | "limit" | "extraHops"
> & {
  seeds: (string | Seed)[];
  lang?: string | null;
  blockAds?: boolean;
  behaviorTimeout?: number | null;
  behaviors?: string | null;
};

export type JobType = "url-list" | "seed-crawl" | "custom";

export type CrawlConfigParams = {
  jobType: JobType;
  name: string;
  schedule: string;
  scale: number;
  profileid: string | null;
  config: SeedConfig;
  crawlTimeout?: number | null;
  tags?: string[];
};

export type InitialCrawlConfig = Pick<
  CrawlConfigParams,
  "name" | "profileid" | "schedule" | "tags" | "crawlTimeout"
> & {
  jobType?: JobType;
  config: Pick<
    CrawlConfigParams["config"],
    "seeds" | "scopeType" | "exclude" | "behaviorTimeout"
  > & {
    extraHops?: CrawlConfigParams["config"]["extraHops"];
  };
};

export type CrawlConfig = CrawlConfigParams & {
  id: string;
  oid: string;
  jobType: JobType;
  userid: string;
  userName: string | null;
  created: string;
  crawlCount: number;
  crawlAttemptCount: number;
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
  oid: string;
  crawlconfigs: { id: string; name: string }[];
};
