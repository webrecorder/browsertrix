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
  quotas: Record<string, number>;
  bytesStored: number;
  users?: {
    [id: string]: {
      role: (typeof AccessCode)[UserRole];
      name: string;
      email: string;
    };
  };
};

export type OrgConfig = any;
