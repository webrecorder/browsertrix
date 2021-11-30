import type { CurrentUser } from "../types/auth";

type Role = "owner";

const AccessCode: Record<Role, number> = {
  owner: 40,
} as const;

export type ArchiveData = {
  id: string;
  name: string;
  users: { [id: string]: typeof AccessCode[Role] };
};

export type Archive = {
  aid: string;
  name?: string;
  id?: string;
  users?: any;
};

export type ArchiveConfig = any;

export function isOwner(archive: ArchiveData, userInfo?: CurrentUser): boolean {
  if (!userInfo) return false;

  return archive.users[userInfo.id] === AccessCode.owner;
}
