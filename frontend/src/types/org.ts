import type { Subscription } from "./billing";
import type { Range } from "./utils";

// From UserRole in backend
export type UserRole = "viewer" | "crawler" | "owner" | "superadmin";

export enum OrgReadOnlyReason {
  SubscriptionPaused = "subscriptionPaused",
  SubscriptionCancelled = "subscriptionCancelled",
}

export const AccessCode: Record<UserRole, number> = {
  superadmin: 100,
  viewer: 10,
  crawler: 20,
  owner: 40,
} as const;

/** `${4-digit year}-${2-digit month}` */
export type YearMonth = `${number}-${Range<0, 2>}${Range<0, 10>}`;

export type OrgQuotas = {
  extraExecMinutes: number;
  giftedExecMinutes: number;
  maxConcurrentCrawls: number;
  maxExecMinutesPerMonth: number;
  maxPagesPerCrawl: number;
  storageQuota: number;
};

export type OrgData = {
  id: string;
  name: string;
  slug: string;
  default: boolean;
  quotas: OrgQuotas;
  bytesStored: number;
  bytesStoredCrawls: number;
  bytesStoredUploads: number;
  bytesStoredProfiles: number;
  usage: { [key: YearMonth]: number } | null;
  crawlExecSeconds?: { [key: YearMonth]: number };
  monthlyExecSeconds?: { [key: YearMonth]: number };
  extraExecSeconds?: { [key: YearMonth]: number };
  giftedExecSeconds?: { [key: YearMonth]: number };
  extraExecSecondsAvailable: number;
  giftedExecSecondsAvailable: number;
  storageQuotaReached?: boolean;
  execMinutesQuotaReached?: boolean;
  users?: {
    [id: string]: {
      role: (typeof AccessCode)[UserRole];
      name: string;
      email: string;
    };
  };
  readOnly: boolean | null;
  readOnlyReason: OrgReadOnlyReason | string | null;
  readOnlyOnCancel: boolean;
  subscription: null | Subscription;
};

export type OrgConfig = unknown;
