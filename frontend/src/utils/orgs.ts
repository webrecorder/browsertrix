import { SubscriptionStatus } from "@/types/billing";
import { AccessCode, type Metrics, type OrgData } from "@/types/org";

export * from "@/types/org";

export function isOwner(accessCode?: AccessCode): boolean {
  if (!accessCode) return false;

  return accessCode === AccessCode.owner;
}

export function isAdmin(accessCode?: AccessCode): boolean {
  if (!accessCode) return false;

  return accessCode >= AccessCode.owner;
}

export function isCrawler(accessCode?: AccessCode): boolean {
  if (!accessCode) return false;

  return accessCode >= AccessCode.crawler;
}

export function isArchivingDisabled(
  org?: OrgData | null,
  checkExecMinutesQuota = false,
): boolean {
  return Boolean(
    !org ||
    org.readOnly ||
    org.storageQuotaReached ||
    (checkExecMinutesQuota ? org.execMinutesQuotaReached : false),
  );
}

export function isTrialing(org?: OrgData | null) {
  return org?.subscription?.status === SubscriptionStatus.Trialing;
}

export function hasUsage(org?: OrgData | null, metrics?: Metrics) {
  return org
    ? Boolean(
        org.bytesStored ||
        metrics?.workflowsQueuedCount ||
        metrics?.workflowsRunningCount ||
        metrics?.collectionsCount,
      )
    : undefined;
}
