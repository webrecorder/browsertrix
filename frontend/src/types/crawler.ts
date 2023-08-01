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
  include?: string[] | null;
  exclude?: string[] | null;
  limit?: number | null;
  extraHops?: number | null;
  depth?: number | null;
};

export type SeedConfig = Pick<
  Seed,
  "scopeType" | "include" | "exclude" | "limit" | "extraHops"
> & {
  seeds: Seed[];
  lang?: string | null;
  blockAds?: boolean;
  behaviorTimeout: number | null;
  pageLoadTimeout: number | null;
  pageExtraDelay: number | null;
  behaviors?: string | null;
  extraHops?: number | null;
  useSitemap: boolean;
  depth?: number | null;
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
  autoAddCollections: string[];
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
  crawlSuccessfulCount: number;
  lastCrawlId: string | null; // last finished or current crawl
  lastCrawlStartTime: string | null;
  lastCrawlTime: string | null; // when last crawl finished
  lastCrawlState: CrawlState;
  lastCrawlSize: number | null;
  lastStartedByName: string | null;
  lastCrawlStopping: boolean | null;
  totalSize: string | null;
  inactive: boolean;
  firstSeed: string;
  isCrawlRunning: boolean | null;
  autoAddCollections: string[];
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
  | "waiting_capacity"
  | "waiting_org_limit"
  | "running"
  | "generate-wacz"
  | "uploading-wacz"
  | "pending-wait"
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
  stats: { done: string; found: string; size: string } | null;
  resources?: { name: string; path: string; hash: string; size: number }[];
  fileCount?: number;
  fileSize?: number;
  completions?: number;
  description: string | null;
  firstSeed: string;
  seedCount: number;
  stopping: boolean;
  collections: string[];
  type?: "crawl" | "upload" | null;
};

export type Upload = Omit<
  Crawl,
  | "cid"
  | "stats"
  | "schedule"
  | "manual"
  | "stopping"
  | "firstSeed"
  | "seedCount"
> & {
  type: "upload";
};
