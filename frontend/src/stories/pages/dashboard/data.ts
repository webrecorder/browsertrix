import {
  orgMock,
  orgSubscriptionMock,
} from "@/stories/decorators/orgDecorator";
import { type APIPaginatedList } from "@/types/api";
import { type Collection } from "@/types/collection";
import { type Metrics, type OrgData } from "@/types/org";

export const metrics = {
  storageUsedBytes: 0,
  storageUsedCrawls: 0,
  storageUsedUploads: 0,
  storageUsedProfiles: 0,
  storageUsedSeedFiles: 0,
  storageUsedThumbnails: 0,
  storageUsedDedupeIndexes: 0,
  storageQuotaBytes: 0,
  archivedItemCount: 0,
  crawlCount: 0,
  uploadCount: 0,
  pageCount: 0,
  crawlPageCount: 0,
  uploadPageCount: 0,
  profileCount: 0,
  workflowsRunningCount: 0,
  maxConcurrentCrawls: 0,
  workflowsQueuedCount: 0,
  collectionsCount: 0,
  publicCollectionsCount: 0,
} satisfies Metrics;

export const metricsWithUsage = {
  storageUsedBytes: orgMock.bytesStored,
  storageUsedCrawls: orgMock.bytesStoredCrawls,
  storageUsedUploads: orgMock.bytesStoredUploads,
  storageUsedProfiles: orgMock.bytesStoredProfiles,
  archivedItemCount: 40,
  crawlCount: 20,
  uploadCount: 2,
  pageCount: 1070,
  crawlPageCount: 1050,
  uploadPageCount: 20,
  profileCount: 2,
} satisfies Partial<Metrics>;

export const metricsWithStorageQuota = {
  storageQuotaBytes: orgMock.quotas.storageQuota,
} satisfies Partial<Metrics>;

export const subscription = {
  ...orgSubscriptionMock,
} satisfies OrgData["subscription"];

export const quotas = {
  ...orgMock.quotas,
} satisfies OrgData["quotas"];

export const quotasWithExecutionMinutes = {
  maxExecMinutesPerMonth: 180,
} satisfies Partial<OrgData["quotas"]>;

export const collections = {
  total: 0,
  page: 1,
  pageSize: 1000,
  items: [],
} satisfies APIPaginatedList<Collection>;
