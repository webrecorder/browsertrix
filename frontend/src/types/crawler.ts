import type { CrawlState } from "./crawlState";

export enum ScopeType {
  Prefix = "prefix",
  Host = "host",
  Domain = "domain",
  Page = "page",
  SPA = "page-spa",
  Custom = "custom",
  Any = "any",
}

export type Seed = {
  url: string;
  scopeType: ScopeType | undefined;
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
    postLoadDelay: number | null;
    behaviors?: string | null;
    extraHops?: number | null;
    useSitemap?: boolean;
    failOnFailedSeed?: boolean;
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
  proxyId: string | null;
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
  lastCrawlState: CrawlState | null;
  lastCrawlSize: number | null;
  lastStartedByName: string | null;
  lastCrawlStopping: boolean | null;
  lastCrawlPausing: boolean | null;
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

export type ProfileWorkflow = {
  id: string;
  name: string;
  firstSeed: string;
  seedCount: number;
};

export type Profile = {
  id: string;
  name: string;
  description: string;
  created: string;
  createdByName: string | null;
  modified: string | null;
  modifiedByName: string | null;
  origins: string[];
  profileId: string;
  baseProfileName: string;
  oid: string;
  crawlconfigs?: ProfileWorkflow[];
  resource?: {
    name: string;
    path: string;
    hash: string;
    size: number;
    replicas: ProfileReplica[] | null;
  };
  crawlerChannel?: string;
  proxyId?: string;
};

// TODO maybe convert this to an enum?
export enum ReviewStatus {
  Bad = 1,
  Poor = 2,
  Fair = 3,
  Good = 4,
  Excellent = 5,
}

type ArchivedItemBase = {
  id: string;
  userid: string;
  userName: string;
  name: string;
  description: string | null;
  oid: string;
  started: string; // UTC ISO date
  finished?: string; // UTC ISO date
  state: CrawlState;
  fileCount?: number;
  fileSize?: number;
  collectionIds: string[];
  collections: { id: string; name: string }[];
  stats: { done: string; found: string; size: string } | null;
  firstSeed: string | null;
  seedCount: number | null;
  tags: string[];
  crawlExecSeconds: number;
  qaCrawlExecSeconds: number;
  reviewStatus?: ReviewStatus;
  completions?: number;
  stopping: boolean | null;
  qaRunCount: number | null;
  activeQAStats: { done: number; found: number } | null;
  lastQAState: CrawlState | null;
  lastQAStarted: string | null;
  pageCount?: number;
  uniquePageCount?: number;
  filePageCount?: number;
  errorPageCount?: number;
};

export type Crawl = ArchivedItemBase &
  CrawlConfig & {
    type: "crawl";
    cid: string;
    schedule: string;
    manual: boolean;
    scale: number;
    resources?: {
      name: string;
      path: string;
      hash: string;
      size: number;
      numReplicas: number;
    }[];
  };

export type Upload = ArchivedItemBase & {
  type: "upload";
  cid: undefined;
  resources: undefined;
  crawlerChannel: "default";
  image: null;
  manual: true;
};

export type CrawlerChannel = {
  id: string;
  image: string;
};

export type Proxy = {
  id: string;
  label: string;
  country_code: string | null;
  description: string | null;
  shared: boolean;
};

export type ProxiesAPIResponse = {
  default_proxy_id: string | null;
  servers: Proxy[];
};

export type ArchivedItem = Crawl | Upload;

export type ArchivedItemPageComment = {
  id: string;
  created: string;
  modified: string;
  userName: string;
  text: string;
};

export type ArchivedItemPage = {
  id: string;
  oid: string;
  crawl_id: string;
  url: string;
  title?: string;
  ts?: string; // Date
  load_state?: number;
  status?: number;
  userid?: string;
  modified?: string;
  approved?: boolean | null;
  notes?: ArchivedItemPageComment[];
};
