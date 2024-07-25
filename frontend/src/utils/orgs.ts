import { AccessCode, type OrgData, type UserRole } from "@/types/org";

export * from "@/types/org";

export function isOwner(accessCode?: (typeof AccessCode)[UserRole]): boolean {
  if (!accessCode) return false;

  return accessCode === AccessCode.owner;
}

export function isAdmin(accessCode?: (typeof AccessCode)[UserRole]): boolean {
  if (!accessCode) return false;

  return accessCode >= AccessCode.owner;
}

export function isCrawler(accessCode?: (typeof AccessCode)[UserRole]): boolean {
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
