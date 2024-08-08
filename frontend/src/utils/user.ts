import type { APIUser } from "@/index";
import { type UserInfo } from "@/types/user";

export function formatAPIUser(userData: APIUser): UserInfo {
  return {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    isVerified: userData.is_verified,
    isSuperAdmin: userData.is_superuser,
    orgs: userData.orgs,
  };
}
