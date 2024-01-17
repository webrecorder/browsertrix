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

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type SeedConfig = Expand<
  Pick<Seed, "scopeType" | "include" | "exclude" | "limit" | "extraHops"> & {
    lang?: string | null;
    blockAds?: boolean;
    behaviorTimeout: number | null;
    pageLoadTimeout: number | null;
    pageExtraDelay: number | null;
    behaviors?: string | null;
    extraHops?: number | null;
    useSitemap: boolean;
    failOnFailedSeed: boolean;
    depth?: number | null;
    userAgent?: string | null;
  }
>;

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
  maxCrawlSize: number | null;
  description: string | null;
  autoAddCollections: string[];
  crawlerChannel: string;
};

export type CrawlConfig = WorkflowParams & {
  oid: string;
  profileName: string | null;
  image: string | null;
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
  lastRun: string;
  totalSize: string | null;
  inactive: boolean;
  firstSeed: string;
  isCrawlRunning: boolean | null;
  autoAddCollections: string[];
  seedCount: number;
};

export type ListWorkflow = Omit<Workflow, "config">;

export type ProfileReplica = {
  name: string;
  custom?: boolean;
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
  resource?: {
    name: string;
    path: string;
    hash: string;
    size: number;
    replicas: ProfileReplica[];
  };
};

export type CrawlState =
  | "starting"
  | "waiting_capacity"
  | "waiting_org_limit"
  | "running"
  | "generate-wacz"
  | "uploading-wacz"
  | "pending-wait"
  | "stopping"
  | "complete"
  | "failed"
  | "skipped_quota_reached"
  | "canceled"
  | "stopped_by_user"
  | "stopped_quota_reached";

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
  resources?: {
    name: string;
    path: string;
    hash: string;
    size: number;
    numReplicas: number;
  }[];
  fileCount?: number;
  fileSize?: number;
  completions?: number;
  description: string | null;
  firstSeed: string;
  seedCount: number;
  stopping: boolean;
  collectionIds: string[];
  collections: { id: string; name: string }[];
  type?: "crawl" | "upload" | null;
  crawlExecSeconds: number;
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
  | "crawlExecSeconds"
> & {
  type: "upload";
};

export type CrawlerChannel = {
  id: string;
  image: string;
};
