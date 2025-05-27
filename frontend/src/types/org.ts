import { z } from "zod";

import { apiDateSchema } from "./api";
import { subscriptionSchema } from "./billing";
import { publicCollectionSchema } from "./collection";

export enum OrgReadOnlyReason {
  SubscriptionPaused = "subscriptionPaused",
  SubscriptionCancelled = "subscriptionCancelled",
}
export const orgReadOnlyReasonSchema = z.nativeEnum(OrgReadOnlyReason);

// From UserRole in backend
export enum AccessCode {
  superadmin = 100,
  viewer = 10,
  crawler = 20,
  owner = 40,
}
export const accessCodeSchema = z.nativeEnum(AccessCode);

export const orgQuotasSchema = z.object({
  extraExecMinutes: z.number(),
  giftedExecMinutes: z.number(),
  maxConcurrentCrawls: z.number(),
  maxExecMinutesPerMonth: z.number(),
  maxPagesPerCrawl: z.number(),
  storageQuota: z.number(),
});
export type OrgQuotas = z.infer<typeof orgQuotasSchema>;

/** `${4-digit year}-${2-digit month}` */
const YEAR_MONTH_REGEX = /^\d{4}-\d{2}$/;
export const yearMonthSchema = z.string().regex(YEAR_MONTH_REGEX);

export const crawlingDefaultsSchema = z.object({
  crawlTimeout: z.number().optional(),
  maxCrawlSize: z.number().optional(),
  pageLoadTimeout: z.number().optional(),
  postLoadDelay: z.number().optional(),
  behaviorTimeout: z.number().optional(),
  pageExtraDelay: z.number().optional(),
  blockAds: z.boolean().optional(),
  profileid: z.string().optional(),
  crawlerChannel: z.string().optional(),
  proxyId: z.string().optional(),
  lang: z.string().optional(),
  userAgent: z.string().optional(),
  exclude: z.array(z.string()),
  customBehaviors: z.array(z.string()),
});
export type CrawlingDefaults = z.infer<typeof crawlingDefaultsSchema>;

export const orgDataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created: apiDateSchema.nullable(),
  slug: z.string(),
  default: z.boolean(),
  quotas: orgQuotasSchema,
  bytesStored: z.number(),
  bytesStoredCrawls: z.number(),
  bytesStoredUploads: z.number(),
  bytesStoredProfiles: z.number(),
  usage: z.record(yearMonthSchema, z.number()).nullable(),
  /* Actual total time used, including time to stop the crawl, gifted, and extra time */
  crawlExecSeconds: z.record(yearMonthSchema, z.number()).nullable().optional(),
  /* Total time within the monthly time quota */
  monthlyExecSeconds: z
    .record(yearMonthSchema, z.number())
    .nullable()
    .optional(),
  extraExecSeconds: z.record(yearMonthSchema, z.number()).nullable().optional(),
  giftedExecSeconds: z
    .record(yearMonthSchema, z.number())
    .nullable()
    .optional(),
  extraExecSecondsAvailable: z.number(),
  giftedExecSecondsAvailable: z.number(),
  storageQuotaReached: z.boolean().optional(),
  execMinutesQuotaReached: z.boolean().optional(),
  users: z
    .record(
      z.object({
        role: accessCodeSchema,
        name: z.string(),
        email: z.string(),
      }),
    )
    .optional(),
  readOnly: z.boolean().nullable(),
  readOnlyReason: z.union([orgReadOnlyReasonSchema, z.string()]).nullable(),
  readOnlyOnCancel: z.boolean().optional(),
  subscription: subscriptionSchema.nullable(),
  crawlingDefaults: crawlingDefaultsSchema.nullable(),
  allowSharedProxies: z.boolean(),
  allowedProxies: z.array(z.string()),
  lastCrawlFinished: apiDateSchema.nullable(),
  enablePublicProfile: z.boolean(),
  publicDescription: z.string().nullable(),
  publicUrl: z.string().nullable(),
});
export type OrgData = z.infer<typeof orgDataSchema>;

export const orgConfigSchema = z.unknown();
export type OrgConfig = z.infer<typeof orgConfigSchema>;

export const publicOrgCollectionsSchema = z.object({
  org: z.object({
    name: z.string(),
    description: z.string(),
    url: z.string(),
    verified: z.boolean(),
  }),
  collections: z.array(publicCollectionSchema),
});
export type PublicOrgCollections = z.infer<typeof publicOrgCollectionsSchema>;
