import type { APIUser } from "@/index";
import { type CurrentUser } from "@/types/user";

export function formatAPIUser(userData: APIUser): CurrentUser {
  return {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    isVerified: userData.is_verified,
    isAdmin: userData.is_superuser,
    orgs: userData.orgs,
  };
}
