import type { AccessCode, OrgData, UserRole } from "./org";

export type UserOrgInviteInfo = {
  inviterEmail: string;
  inviterName: string;
  firstOrgAdmin: boolean;
  orgNameRequired: boolean;
  role: (typeof AccessCode)[UserRole];
  oid?: string;
  orgName?: string;
  orgSlug?: string;
};

export type UserOrg = OrgData & {
  default?: boolean;
  role: (typeof AccessCode)[UserRole];
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  isVerified: boolean;
  isAdmin: boolean;
  orgs: UserOrg[];
};
