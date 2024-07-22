import type { AccessCode, OrgData, UserRole } from "./org";

export type UserOrgInviteInfo = {
  inviterEmail: string;
  inviterName: string;
  fromSuperuser?: boolean;
  firstOrgAdmin: boolean;
  role: (typeof AccessCode)[UserRole];
  oid: string;
  orgName?: string;
  orgSlug?: string;
};

export type UserRegisterResponseData = {
  id: string;
  name: string;
  email: string;
  is_superuser: boolean;
  is_verified: boolean;
  orgs: UserOrg[];
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
  isSuperAdmin: boolean;
  orgs: UserOrg[];
};
