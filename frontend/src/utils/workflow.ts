/**
 * TODO Move to utils/crawl-configs/
 */
import { msg, str } from "@lit/localize";
import { z } from "zod";

import { getAppSettings, type AppSettings } from "./app";

import type { Tags } from "@/components/ui/tag-input";
import type { UserGuideEventMap } from "@/index";
import {
  Behavior,
  CrawlerChannelImage,
  ScopeType,
  type Profile,
  type Seed,
  type SeedConfig,
  type WorkflowParams,
} from "@/types/crawler";
import type { OrgData } from "@/types/org";
import {
  WorkflowScopeType,
  type NewWorkflowOnlyScopeType,
} from "@/types/workflow";
import { unescapeCustomPrefix } from "@/utils/crawl-workflows/unescapeCustomPrefix";
import { DEFAULT_MAX_SCALE, isPageScopeType } from "@/utils/crawler";
import { getNextDate, getScheduleInterval } from "@/utils/cron";
import localize, { getDefaultLang } from "@/utils/localize";

export const BYTES_PER_GB = 1e9;
export const DEFAULT_SELECT_LINKS = ["a[href]->href" as const];
export const DEFAULT_AUTOCLICK_SELECTOR = "a";
export const SEED_LIST_FILE_EXT = "txt";
export const MAX_SEED_LIST_STRING_BYTES = 500 * 1000;
export const MAX_SEED_LIST_FILE_BYTES = 25 * 1e6;

export const SECTIONS = [
  "scope",
  "limits",
  "behaviors",
  "browserSettings",
  "scheduling",
  "deduplication",
  "collections",
  "metadata",
] as const;
export const sectionsEnum = z.enum(SECTIONS);
export type SectionsEnum = z.infer<typeof sectionsEnum>;

export enum GuideHash {
  Scope = "scope",
  Limits = "crawl-limits",
  Behaviors = "page-behavior",
  BrowserSettings = "browser-settings",
  Scheduling = "scheduling",
  Deduplication = "deduplication",
  Collections = "collections",
  Metadata = "metadata",
}

export enum SeedListFormat {
  JSON = "json",
  File = "file",
}

export const workflowTabToGuideHash: Record<SectionsEnum, GuideHash> = {
  scope: GuideHash.Scope,
  limits: GuideHash.Limits,
  behaviors: GuideHash.Behaviors,
  browserSettings: GuideHash.BrowserSettings,
  scheduling: GuideHash.Scheduling,
  deduplication: GuideHash.Deduplication,
  collections: GuideHash.Collections,
  metadata: GuideHash.Metadata,
};

export function makeUserGuideEvent(
  section: SectionsEnum,
): UserGuideEventMap["btrix-user-guide-show"] {
  const userGuideHash =
    (workflowTabToGuideHash[section] as GuideHash | undefined) ||
    GuideHash.Scope;

  return new CustomEvent<UserGuideEventMap["btrix-user-guide-show"]["detail"]>(
    "btrix-user-guide-show",
    {
      detail: {
        path: `workflow-setup/#${userGuideHash}`,
      },
      bubbles: true,
      composed: true,
    },
  );
}

export function defaultLabel(value: unknown): string {
  if (value === Infinity) {
    return msg("Default: Unlimited");
  }
  if (typeof value === "number") {
    return msg(str`Default: ${localize.number(value)}`);
  }
  if (value) {
    return msg(str`Default: ${value}`);
  }
  return "";
}

export function defaultSeedListFileName() {
  return `URL-List-${new Date()
    .toISOString()
    .split(".")[0]
    .replace(/[^0-9]/g, "")}.${SEED_LIST_FILE_EXT}`;
}

export type FormState = {
  primarySeedUrl: string;
  urlList: string;
  seedListFormat: SeedListFormat;
  seedFileId: string | null;
  seedFile: File | null;
  includeLinkedPages: boolean;
  useSitemap: boolean;
  failOnFailedSeed: boolean;
  failOnContentCheck: boolean;
  customIncludeUrlList: string;
  crawlTimeoutMinutes: number;
  behaviorTimeoutSeconds: number | null;
  pageLoadTimeoutSeconds: number | null;
  pageExtraDelaySeconds: number | null;
  postLoadDelaySeconds: number | null;
  maxCrawlSizeGB: number;
  maxScopeDepth: number | null;
  scopeType:
    | Exclude<ScopeType, ScopeType.Any>
    | (typeof NewWorkflowOnlyScopeType)[keyof typeof NewWorkflowOnlyScopeType];
  exclusions: WorkflowParams["config"]["exclude"];
  pageLimit: WorkflowParams["config"]["limit"];
  browserWindows: WorkflowParams["browserWindows"];
  blockAds: WorkflowParams["config"]["blockAds"];
  lang: WorkflowParams["config"]["lang"];
  /**
   * NOTE The UI currently only supports "cron" and "none".
   */
  scheduleType: "date" | "cron" | "none";
  /**
   * One of known frequency enums.
   *
   * If an empty string, either `scheduleType` should be `"none"`
   * or `scheduleCustom` should be set.
   */
  scheduleFrequency: "daily" | "weekly" | "monthly" | "";
  /**
   * Day of the month local to the user's browser timezone.
   * Only used if `scheduleFrequency` is `"monthly"`.
   */
  scheduleDayOfMonth?: number;
  /**
   * Day of the week local to the user's browser timezone.
   * Only used if `scheduleFrequency` is `"weekly"`.
   */
  scheduleDayOfWeek?: number;
  /**
   * Time local to the user's browser timezone.
   * Only used if `scheduleFrequency` is specified.
   */
  scheduleTime?: {
    hour: number;
    minute: number;
    period: "AM" | "PM";
  };
  /**
   * Custom schedule in cron format.
   */
  scheduleCustom?: string;
  dedupeType: "none" | "collection";
  dedupCollId: string | null;
  jobName: WorkflowParams["name"];
  browserProfile: Profile | null;
  tags: Tags;
  autoAddCollections: string[];
  description: WorkflowParams["description"];
  autoscrollBehavior: boolean;
  autoclickBehavior: boolean;
  customBehavior: boolean;
  userAgent: string | null;
  crawlerChannel: string;
  proxyId: string | null;
  selectLinks: string[];
  clickSelector: string;
  saveStorage: WorkflowParams["config"]["saveStorage"];
};

export type FormStateField = keyof FormState;

export type WorkflowDefaults = {
  behaviorTimeoutSeconds?: number;
  pageLoadTimeoutSeconds?: number;
  maxPagesPerCrawl?: number;
  maxBrowserWindows: number;
};

export const appDefaults: WorkflowDefaults = {
  maxBrowserWindows: DEFAULT_MAX_SCALE,
};

export const getDefaultFormState = (): FormState => ({
  primarySeedUrl: "",
  urlList: "",
  seedListFormat: SeedListFormat.JSON,
  seedFileId: null,
  seedFile: null,
  includeLinkedPages: false,
  useSitemap: false,
  failOnFailedSeed: false,
  failOnContentCheck: false,
  customIncludeUrlList: "",
  crawlTimeoutMinutes: 0,
  maxCrawlSizeGB: 0,
  behaviorTimeoutSeconds: null,
  pageLoadTimeoutSeconds: null,
  pageExtraDelaySeconds: null,
  postLoadDelaySeconds: null,
  maxScopeDepth: null,
  scopeType: ScopeType.Page,
  exclusions: [],
  pageLimit: null,
  browserWindows: 2,
  blockAds: true,
  lang: getDefaultLang(),
  scheduleType: "none",
  scheduleFrequency: "weekly",
  scheduleDayOfMonth: new Date().getDate(),
  scheduleDayOfWeek: new Date().getDay(),
  scheduleTime: {
    hour: 12,
    minute: 0,
    period: "AM",
  },
  dedupeType: "collection",
  dedupCollId: null,
  jobName: "",
  browserProfile: null,
  tags: [],
  autoAddCollections: [],
  description: null,
  autoscrollBehavior: true,
  autoclickBehavior: false,
  userAgent: null,
  crawlerChannel: CrawlerChannelImage.Default,
  proxyId: null,
  selectLinks: DEFAULT_SELECT_LINKS,
  clickSelector: DEFAULT_AUTOCLICK_SELECTOR,
  customBehavior: false,
  saveStorage: false,
});

export const mapSeedToUrl = (arr: Seed[]) =>
  arr.map((seed) => (typeof seed === "string" ? seed : seed.url));

export function getInitialFormState(params: {
  configId?: string;
  initialSeeds?: Seed[];
  initialWorkflow?: WorkflowParams;
  org?: OrgData | null;
}): FormState {
  const defaultFormState = getDefaultFormState();
  if (!params.initialWorkflow) return defaultFormState;
  const formState: Partial<FormState> = {};
  const seedsConfig = params.initialWorkflow.config;
  let primarySeedConfig: SeedConfig | Seed = seedsConfig;
  if (!isPageScopeType(params.initialWorkflow.config.scopeType)) {
    if (params.initialSeeds) {
      const firstSeed = params.initialSeeds[0];
      if (typeof firstSeed === "string") {
        formState.primarySeedUrl = firstSeed;
      } else {
        primarySeedConfig = firstSeed;
        formState.primarySeedUrl = primarySeedConfig.url;
      }
    }
    if (primarySeedConfig.include?.length) {
      formState.customIncludeUrlList = primarySeedConfig.include
        // Unescape regex
        .map(unescapeCustomPrefix)
        .join("\n");
      // if we have additional include URLs, set to "custom" scope here
      // to indicate 'Custom Page Prefix' option
      formState.scopeType = ScopeType.Custom;
    }
    const additionalSeeds = params.initialSeeds?.slice(1);
    if (additionalSeeds?.length) {
      formState.urlList = mapSeedToUrl(additionalSeeds).join("\n");
    }
    formState.useSitemap = seedsConfig.useSitemap;
  } else {
    if (params.initialWorkflow.config.seedFileId) {
      formState.seedFileId = params.initialWorkflow.config.seedFileId;
      formState.scopeType = WorkflowScopeType.PageList;
      formState.seedListFormat = SeedListFormat.File;
    } else if (params.initialSeeds?.length) {
      if (params.initialSeeds.length === 1) {
        formState.scopeType = WorkflowScopeType.Page;
      } else {
        formState.scopeType = WorkflowScopeType.PageList;
      }

      formState.urlList = mapSeedToUrl(params.initialSeeds).join("\n");
    }

    formState.failOnFailedSeed = seedsConfig.failOnFailedSeed;
    formState.failOnContentCheck = seedsConfig.failOnContentCheck;
  }

  if (params.initialWorkflow.schedule) {
    formState.scheduleType = "cron";
    const interval = getScheduleInterval(params.initialWorkflow.schedule);

    if (interval) {
      formState.scheduleFrequency = interval;
      const nextDate = getNextDate(params.initialWorkflow.schedule)!;
      formState.scheduleDayOfMonth = nextDate.getDate();
      formState.scheduleDayOfWeek = nextDate.getDay();
      const hours = nextDate.getHours();
      formState.scheduleTime = {
        hour: hours % 12 || 12,
        minute: nextDate.getMinutes(),
        period: hours > 11 ? "PM" : "AM",
      };
    } else {
      formState.scheduleFrequency = "";
      formState.scheduleCustom = params.initialWorkflow.schedule;
    }
  } else {
    formState.scheduleType = "none";
  }

  if (params.initialWorkflow.tags.length) {
    formState.tags = params.initialWorkflow.tags;
  }

  if (params.initialWorkflow.autoAddCollections.length) {
    formState.autoAddCollections = params.initialWorkflow.autoAddCollections;
  }

  if (params.initialWorkflow.dedupCollId) {
    formState.dedupeType = "collection";
    formState.dedupCollId = params.initialWorkflow.dedupCollId;
  }

  const secondsToMinutes = (value: unknown, fallback = 0) => {
    if (typeof value === "number" && value > 0) return value / 60;
    return fallback;
  };

  const bytesToGB = (value: unknown, fallback = 0) => {
    if (typeof value === "number" && value > 0)
      return Math.floor(value / BYTES_PER_GB);
    return fallback;
  };

  const enableCustomBehaviors = Boolean(
    params.initialWorkflow.config.customBehaviors.length,
  );

  return {
    ...defaultFormState,
    primarySeedUrl: defaultFormState.primarySeedUrl,
    urlList: defaultFormState.urlList,
    customIncludeUrlList: defaultFormState.customIncludeUrlList,
    crawlTimeoutMinutes: secondsToMinutes(
      params.initialWorkflow.crawlTimeout,
      defaultFormState.crawlTimeoutMinutes,
    ),
    maxCrawlSizeGB: bytesToGB(
      params.initialWorkflow.maxCrawlSize,
      defaultFormState.maxCrawlSizeGB,
    ),
    behaviorTimeoutSeconds:
      seedsConfig.behaviorTimeout ?? defaultFormState.behaviorTimeoutSeconds,
    pageLoadTimeoutSeconds:
      seedsConfig.pageLoadTimeout ?? defaultFormState.pageLoadTimeoutSeconds,
    pageExtraDelaySeconds:
      seedsConfig.pageExtraDelay ?? defaultFormState.pageExtraDelaySeconds,
    postLoadDelaySeconds:
      seedsConfig.postLoadDelay ?? defaultFormState.postLoadDelaySeconds,
    maxScopeDepth: primarySeedConfig.depth ?? defaultFormState.maxScopeDepth,
    browserWindows: params.initialWorkflow.browserWindows,
    blockAds: params.initialWorkflow.config.blockAds,
    lang: params.initialWorkflow.config.lang ?? defaultFormState.lang,
    scheduleType: defaultFormState.scheduleType,
    scheduleFrequency: defaultFormState.scheduleFrequency,
    tags: params.initialWorkflow.tags,
    autoAddCollections: params.initialWorkflow.autoAddCollections,
    jobName: params.initialWorkflow.name || defaultFormState.jobName,
    description: params.initialWorkflow.description,
    browserProfile: params.initialWorkflow.profileid
      ? ({ id: params.initialWorkflow.profileid } as Profile)
      : defaultFormState.browserProfile,
    scopeType: primarySeedConfig.scopeType as FormState["scopeType"],
    exclusions: seedsConfig.exclude?.length === 0 ? [""] : seedsConfig.exclude,
    includeLinkedPages: Boolean(
      primarySeedConfig.extraHops || seedsConfig.extraHops,
    ),
    useSitemap: seedsConfig.useSitemap ?? defaultFormState.useSitemap,
    failOnFailedSeed:
      seedsConfig.failOnFailedSeed ?? defaultFormState.failOnFailedSeed,
    failOnContentCheck:
      seedsConfig.failOnContentCheck ?? defaultFormState.failOnContentCheck,
    pageLimit:
      params.initialWorkflow.config.limit ?? defaultFormState.pageLimit,
    autoscrollBehavior: params.initialWorkflow.config.behaviors
      ? params.initialWorkflow.config.behaviors.includes(Behavior.AutoScroll)
      : enableCustomBehaviors
        ? false
        : defaultFormState.autoscrollBehavior,
    autoclickBehavior: params.initialWorkflow.config.behaviors
      ? params.initialWorkflow.config.behaviors.includes(Behavior.AutoClick)
      : enableCustomBehaviors
        ? false
        : defaultFormState.autoclickBehavior,
    customBehavior: enableCustomBehaviors,
    selectLinks: params.initialWorkflow.config.selectLinks,
    clickSelector: params.initialWorkflow.config.clickSelector,
    userAgent:
      params.initialWorkflow.config.userAgent ?? defaultFormState.userAgent,
    crawlerChannel:
      params.initialWorkflow.crawlerChannel || defaultFormState.crawlerChannel,
    proxyId: params.initialWorkflow.proxyId || defaultFormState.proxyId,
    saveStorage: params.initialWorkflow.config.saveStorage,
    ...formState,
  };
}

export async function getServerDefaults(): Promise<WorkflowDefaults> {
  const defaults = { ...appDefaults };

  try {
    const data = await getAppSettings();

    if (data.defaultBehaviorTimeSeconds > 0) {
      defaults.behaviorTimeoutSeconds = data.defaultBehaviorTimeSeconds;
    }
    if (data.defaultPageLoadTimeSeconds > 0) {
      defaults.pageLoadTimeoutSeconds = data.defaultPageLoadTimeSeconds;
    }
    if (data.maxPagesPerCrawl > 0) {
      defaults.maxPagesPerCrawl = data.maxPagesPerCrawl;
    }
    if (data.maxBrowserWindows) {
      defaults.maxBrowserWindows = data.maxBrowserWindows;
    }

    return defaults;
  } catch (e) {
    console.debug(e);
  }

  return defaults;
}

export function* rangeBrowserWindows(
  settings: AppSettings | null,
): Iterable<number> {
  if (!settings) {
    yield 1;
    return;
  }

  const { numBrowsersPerInstance, maxBrowserWindows } = settings;

  for (let i = 1; i < numBrowsersPerInstance; i++) {
    yield i;
  }

  for (
    let i = numBrowsersPerInstance;
    i <= maxBrowserWindows;
    i += numBrowsersPerInstance
  ) {
    yield i;
  }
}
