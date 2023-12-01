// From UserRole in backend
export type UserRole = "viewer" | "crawler" | "owner" | "superadmin";

export const AccessCode: Record<UserRole, number> = {
  superadmin: 100,
  viewer: 10,
  crawler: 20,
  owner: 40,
} as const;

export type OrgData = {
  id: string;
  name: string;
  slug: string;
  quotas: Record<string, number>;
  bytesStored: number;
  usage: {
    // Keyed by {4-digit year}-{2-digit month}
    [key: string]: number;
  } | null;
  crawlExecSeconds: {
    // Keyed by {4-digit year}-{2-digit month}
    [key: string]: number;
  };
  monthlyExecSeconds: {
    // Keyed by {4-digit year}-{2-digit month}
    [key: string]: number;
  };
  extraExecSeconds: {
    // Keyed by {4-digit year}-{2-digit month}
    [key: string]: number;
  };
  giftedExecSeconds: {
    // Keyed by {4-digit year}-{2-digit month}
    [key: string]: number;
  };
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
};

export type OrgConfig = unknown;
