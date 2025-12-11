import { type OrgData } from "@/types/org";

export function hasExecutionMinuteQuota(org: OrgData | null | undefined) {
  if (!org) return;

  return (
    org.quotas.maxExecMinutesPerMonth > 0 ||
    org.quotas.extraExecMinutes > 0 ||
    org.quotas.giftedExecMinutes > 0
  );
}
export function hasStorageQuota(org: OrgData | null | undefined) {
  return !!org?.quotas.storageQuota;
}
