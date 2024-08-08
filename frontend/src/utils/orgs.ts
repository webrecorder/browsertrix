import { AccessCode, type OrgData } from "@/types/org";

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
