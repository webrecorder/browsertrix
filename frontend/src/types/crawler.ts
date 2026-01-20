import type { CrawlState } from "./crawlState";
import type { StorageFile } from "./storage";

export enum ScopeType {
  Prefix = "prefix",
  Host = "host",
  Domain = "domain",
  Page = "page",
  SPA = "page-spa",
  Custom = "custom",
  Any = "any",
}

export enum Behavior {
  AutoScroll = "autoscroll",
  AutoClick = "autoclick",
  AutoPlay = "autoplay",
  AutoFetch = "autofetch",
  SiteSpecific = "siteSpecific",
}

export enum CrawlerChannelImage {
  Default = "default",
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
    seedFileId?: string | null;
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
    failOnContentCheck?: boolean;
    depth?: number | null;
    userAgent?: string | null;
    selectLinks: string[];
    customBehaviors: string[];
    clickSelector: string;
    saveStorage?: boolean;
    useRobots?: boolean;
  }
>;

export type JobType = "url-list" | "seed-crawl" | "custom";

export type WorkflowParams = {
  jobType?: JobType;
  name: string;
  schedule: string;
  browserWindows: number;
  profileid: string | null;
  profileName?: string | null;
  config: SeedConfig;
  tags: string[];
  crawlTimeout: number | null;
  maxCrawlSize: number | null;
  description: string | null;
  autoAddCollections: string[];
  crawlerChannel: string;
  proxyId: string | null;
  dedupeCollId?: string | null;
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
  // User has requested pause, but actual state can be running or paused
  // OR user has requested resume, but actual state is not running
  lastCrawlShouldPause: boolean | null;
  lastCrawlPausedAt: string | null;
  lastCrawlPausedExpiry: string | null;
  lastRun: string;
  totalSize: string | number | null;
  inactive: boolean;
  firstSeed: string;
  isCrawlRunning: boolean | null;
  autoAddCollections: string[];
  seedCount: number;
  shareable?: boolean;
};

export type ListWorkflow = Omit<Workflow, "config" | "image"> & {
  config: Workflow["config"] | null;
};

export type ProfileReplica = {
  name: string;
  custom?: boolean;
};

export type Profile = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  created: string;
  createdBy: string | null; // User ID
  createdByName: string | null; // User Name
  modified: string | null;
  modifiedBy: string | null; // User ID
  modifiedByName: string | null; // User Name
  modifiedCrawlDate: string | null;
  modifiedCrawlId: string | null;
  modifiedCrawlCid: string | null;
  origins: string[];
  profileId: string;
  baseProfileName: string;
  oid: string;
  inUse: boolean;
  resource?: {
    name: string;
    path: string;
    hash: string;
    size: number;
    replicas: ProfileReplica[] | null;
  };
  crawlerChannel?: CrawlerChannelImage | AnyString;
  proxyId?: string;
};

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
  requiresCrawls: string[];
  requiredByCrawls: string[];
};

export type Crawl = ArchivedItemBase &
  Omit<
    CrawlConfig,
    | "config"
    | "autoAddCollections"
    | "schedule"
    | "crawlTimeout"
    | "maxCrawlSize"
  > & {
    type: "crawl";
    cid: string;
    manual: boolean;
    scale: number;
    browserWindows: number;
    shouldPause: boolean | null;
    resources?: (StorageFile & { numReplicas: number })[];
  };

export type CrawlReplay = Crawl & Pick<CrawlConfig, "config">;

export type Upload = ArchivedItemBase & {
  type: "upload";
  cid: undefined;
  resources: undefined;
  crawlerChannel: CrawlerChannelImage.Default;
  image: null;
  manual: true;
};

export type CrawlerChannel = {
  id: CrawlerChannelImage | AnyString;
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

export type CrawlerChannelsAPIResponse = {
  channels: CrawlerChannel[];
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

export enum CrawlLogLevel {
  Fatal = "fatal",
  Error = "error",
  Warning = "warn",
  Info = "info",
  Debug = "debug",
}

export enum CrawlLogContext {
  General = "general",
  Scope = "scope",
  Behavior = "behavior",
  BehaviorScript = "behaviorScript",
  BehaviorScriptCustom = "behaviorScriptCustom",
}

export type CrawlLog = {
  timestamp: string;
  logLevel: CrawlLogLevel;
  details?: Record<string, unknown> & {
    behavior?: string;
    page?: string;
    stack?: string;
  };
  context: CrawlLogContext | string;
  message: string;
};
