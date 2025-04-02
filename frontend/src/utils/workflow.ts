import { msg, str } from "@lit/localize";
import { z } from "zod";

import { getAppSettings } from "./app";

import type { Tags } from "@/components/ui/tag-input";
import {
  Behavior,
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
import { DEFAULT_MAX_SCALE, isPageScopeType } from "@/utils/crawler";
import { getNextDate, getScheduleInterval } from "@/utils/cron";
import localize, { getDefaultLang } from "@/utils/localize";
import { regexUnescape } from "@/utils/string";

export const BYTES_PER_GB = 1e9;
export const DEFAULT_SELECT_LINKS = ["a[href]->href" as const];
export const DEFAULT_AUTOCLICK_SELECTOR = "a" as const;

export const SECTIONS = [
  "scope",
  "limits",
  "behaviors",
  "browserSettings",
  "scheduling",
  "metadata",
] as const;
export const sectionsEnum = z.enum(SECTIONS);
export type SectionsEnum = z.infer<typeof sectionsEnum>;

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

export type FormState = {
  primarySeedUrl: string;
  urlList: string;
  includeLinkedPages: boolean;
  useSitemap: boolean;
  failOnFailedSeed: boolean;
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
  scale: WorkflowParams["scale"];
  blockAds: WorkflowParams["config"]["blockAds"];
  lang: WorkflowParams["config"]["lang"];
  scheduleType: "date" | "cron" | "none";
  scheduleFrequency: "daily" | "weekly" | "monthly" | "";
  scheduleDayOfMonth?: number;
  scheduleDayOfWeek?: number;
  scheduleTime?: {
    hour: number;
    minute: number;
    period: "AM" | "PM";
  };
  runNow: boolean;
  jobName: WorkflowParams["name"];
  browserProfile: Profile | null;
  tags: Tags;
  autoAddCollections: string[];
  description: WorkflowParams["description"];
  autoscrollBehavior: boolean;
  autoclickBehavior: boolean;
  userAgent: string | null;
  crawlerChannel: string;
  proxyId: string | null;
  selectLinks: string[];
  clickSelector: string;
};

export type FormStateField = keyof FormState;

export type WorkflowDefaults = {
  behaviorTimeoutSeconds?: number;
  pageLoadTimeoutSeconds?: number;
  maxPagesPerCrawl?: number;
  maxScale: number;
};

export const appDefaults: WorkflowDefaults = {
  maxScale: DEFAULT_MAX_SCALE,
};

export const getDefaultFormState = (): FormState => ({
  primarySeedUrl: "",
  urlList: "",
  includeLinkedPages: false,
  useSitemap: false,
  failOnFailedSeed: false,
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
  scale: 1,
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
  runNow: false,
  jobName: "",
  browserProfile: null,
  tags: [],
  autoAddCollections: [],
  description: null,
  autoscrollBehavior: true,
  autoclickBehavior: false,
  userAgent: null,
  crawlerChannel: "default",
  proxyId: null,
  selectLinks: DEFAULT_SELECT_LINKS,
  clickSelector: DEFAULT_AUTOCLICK_SELECTOR,
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
        .map(regexUnescape)
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
    if (params.initialSeeds?.length) {
      if (params.initialSeeds.length === 1) {
        formState.scopeType = WorkflowScopeType.Page;
      } else {
        formState.scopeType = WorkflowScopeType.PageList;
      }

      formState.urlList = mapSeedToUrl(params.initialSeeds).join("\n");
    }

    formState.failOnFailedSeed = seedsConfig.failOnFailedSeed;
  }

  if (params.initialWorkflow.schedule) {
    formState.scheduleType = "cron";
    formState.scheduleFrequency = getScheduleInterval(
      params.initialWorkflow.schedule,
    );
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
    formState.scheduleType = "none";
  }

  if (params.initialWorkflow.tags.length) {
    formState.tags = params.initialWorkflow.tags;
  }

  if (params.initialWorkflow.autoAddCollections.length) {
    formState.autoAddCollections = params.initialWorkflow.autoAddCollections;
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
    scale: params.initialWorkflow.scale,
    blockAds: params.initialWorkflow.config.blockAds,
    lang: params.initialWorkflow.config.lang ?? defaultFormState.lang,
    scheduleType: defaultFormState.scheduleType,
    scheduleFrequency: defaultFormState.scheduleFrequency,
    runNow:
      params.org?.storageQuotaReached || params.org?.execMinutesQuotaReached
        ? false
        : defaultFormState.runNow,
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
    pageLimit:
      params.initialWorkflow.config.limit ?? defaultFormState.pageLimit,
    autoscrollBehavior: params.initialWorkflow.config.behaviors
      ? params.initialWorkflow.config.behaviors.includes(Behavior.AutoScroll)
      : defaultFormState.autoscrollBehavior,
    autoclickBehavior: params.initialWorkflow.config.behaviors
      ? params.initialWorkflow.config.behaviors.includes(Behavior.AutoClick)
      : defaultFormState.autoclickBehavior,
    selectLinks: params.initialWorkflow.config.selectLinks,
    userAgent:
      params.initialWorkflow.config.userAgent ?? defaultFormState.userAgent,
    crawlerChannel:
      params.initialWorkflow.crawlerChannel || defaultFormState.crawlerChannel,
    proxyId: params.initialWorkflow.proxyId || defaultFormState.proxyId,
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
    if (data.maxScale) {
      defaults.maxScale = data.maxScale;
    }

    return defaults;
  } catch (e) {
    console.debug(e);
  }

  return defaults;
}
