type Role = "owner";

export const AccessCode: Record<Role, number> = {
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
