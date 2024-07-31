import { z } from "zod";

import { accessCodeSchema } from "./org";

export const userOrgSchema = z.object({
  default: z.boolean().optional(),
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: accessCodeSchema,
});
export type UserOrg = z.infer<typeof userOrgSchema>;

export const userOrgInviteInfoSchema = z.object({
  inviterEmail: z.string().email().nullable(),
  inviterName: z.string().nullable(),
  fromSuperuser: z.boolean(),
  firstOrgAdmin: z.boolean(),
  role: accessCodeSchema,
  oid: z.string().uuid(),
  orgName: z.string().nullable().optional(),
  orgSlug: z.string().nullable().optional(),
});
export type UserOrgInviteInfo = z.infer<typeof userOrgInviteInfoSchema>;

export const userRegisterResponseDataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  is_superuser: z.boolean(),
  is_verified: z.boolean(),
  orgs: z.array(userOrgSchema),
});
export type UserRegisterResponseData = z.infer<
  typeof userRegisterResponseDataSchema
>;

export const userInfoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  isVerified: z.boolean(),
  isSuperAdmin: z.boolean(),
  orgs: z.array(userOrgSchema),
});
export type UserInfo = z.infer<typeof userInfoSchema>;
