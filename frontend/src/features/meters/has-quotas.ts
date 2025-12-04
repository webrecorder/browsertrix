import { type OrgData } from "@/types/org";

export function hasExecutionMinuteQuota(org: OrgData | null | undefined) {
  if (!org) return;

  let quotaSeconds = 0;

  if (org.quotas.maxExecMinutesPerMonth) {
    quotaSeconds = org.quotas.maxExecMinutesPerMonth * 60;
  }

  let quotaSecondsAllTypes = quotaSeconds;

  if (org.extraExecSecondsAvailable) {
    quotaSecondsAllTypes += org.extraExecSecondsAvailable;
  }

  if (org.giftedExecSecondsAvailable) {
    quotaSecondsAllTypes += org.giftedExecSecondsAvailable;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
  const currentPeriod = `${currentYear}-${currentMonth}`;

  let usageSecondsExtra = 0;
  if (org.extraExecSeconds) {
    const actualUsageExtra = org.extraExecSeconds[currentPeriod];
    if (actualUsageExtra) {
      usageSecondsExtra = actualUsageExtra;
    }
  }
  const maxExecSecsExtra = org.quotas.extraExecMinutes * 60;
  // Cap usage at quota for display purposes
  if (usageSecondsExtra > maxExecSecsExtra) {
    usageSecondsExtra = maxExecSecsExtra;
  }
  if (usageSecondsExtra) {
    // Quota for extra = this month's usage + remaining available
    quotaSecondsAllTypes += usageSecondsExtra;
  }

  let usageSecondsGifted = 0;
  if (org.giftedExecSeconds) {
    const actualUsageGifted = org.giftedExecSeconds[currentPeriod];
    if (actualUsageGifted) {
      usageSecondsGifted = actualUsageGifted;
    }
  }
  const maxExecSecsGifted = org.quotas.giftedExecMinutes * 60;
  // Cap usage at quota for display purposes
  if (usageSecondsGifted > maxExecSecsGifted) {
    usageSecondsGifted = maxExecSecsGifted;
  }
  if (usageSecondsGifted) {
    // Quota for gifted = this month's usage + remaining available
    quotaSecondsAllTypes += usageSecondsGifted;
  }

  const hasQuota = Boolean(quotaSecondsAllTypes);

  return hasQuota;
}
export function hasStorageQuota(org: OrgData | null | undefined) {
  return !!org?.quotas.storageQuota;
}
