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
  extraHops?: number | null;
};

export type JobType = "url-list" | "seed-crawl" | "custom";

export type WorkflowParams = {
  jobType?: JobType;
  name: string;
  schedule: string;
  scale: number;
  profileid: string | null;
  config: SeedConfig;
  tags: string[];
  crawlTimeout: number | null;
  description: string | null;
};

export type CrawlConfig = WorkflowParams & {
  oid: string;
  profileName: string | null;
};

export type Workflow = CrawlConfig & {
  id: string;
  createdBy: string; // User ID
  createdByName: string | null; // User full name
  created: string; // Date string
  modifiedBy: string; // User ID
  modifiedByName: string | null; // User full name
  modified: string; // Date string
  crawlCount: number;
  crawlAttemptCount: number;
  lastCrawlId: string;
  lastCrawlTime: string;
  lastCrawlState: CrawlState;
  currCrawlId: string;
  inactive: boolean;
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

export type CrawlState =
  | "starting"
  | "running"
  | "complete"
  | "failed"
  | "partial_complete"
  | "timed_out"
  | "stopping"
  | "canceled";

export type Crawl = CrawlConfig & {
  id: string;
  userid: string;
  userName: string;
  oid: string;
  cid: string;
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
  notes: string | null;
  firstSeed: string;
  seedCount: number;
};
